/**
 * MCP Tasks extension store (io.modelcontextprotocol/tasks).
 *
 * A task wraps one tools/call that the server chose to answer with a handle
 * instead of blocking. The wrapped call runs exactly as it would synchronously;
 * its CallToolResult becomes the task's `result`, so a client polling via
 * tasks/get receives the same payload a plain tools/call would have returned.
 *
 * The store is process-global rather than per-connection: clients poll on new
 * connections (HTTP reconnects, resumed sessions), so a task ID must stay
 * answerable for as long as this process holds the record.
 */

import { LRUCache } from 'lru-cache';
import { nanoid } from 'nanoid';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('task-store');

export const TASKS_EXTENSION_ID = 'io.modelcontextprotocol/tasks';

export const TASK_STATUS = {
  WORKING: 'working',
  INPUT_REQUIRED: 'input_required',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

const TERMINAL_STATUSES = new Set([
  TASK_STATUS.COMPLETED,
  TASK_STATUS.FAILED,
  TASK_STATUS.CANCELLED,
]);

// Model calls take seconds to minutes; polling faster than this only adds load.
export const DEFAULT_POLL_INTERVAL_MS = 2000;

// How long a task stays answerable after it reaches a terminal status. Clients
// poll every few seconds, so this only needs to cover a client that was away
// (disconnected, resumed later) when the task finished.
export const DEFAULT_TERMINAL_RETENTION_MS = 60 * 60 * 1000;

// Bounds memory if a client creates tasks and never polls them.
const MAX_TASKS = 1000;

const JSONRPC_INTERNAL_ERROR = -32603;

/**
 * True when the request's per-request client capabilities declare the tasks
 * extension. Servers must never answer with a task otherwise.
 * @param {object|undefined} meta - The request's `params._meta`
 */
export function clientSupportsTasks(meta) {
  const extensions =
    meta?.['io.modelcontextprotocol/clientCapabilities']?.extensions;
  return Boolean(
    extensions &&
      typeof extensions === 'object' &&
      Object.hasOwn(extensions, TASKS_EXTENSION_ID),
  );
}

export function isTerminalStatus(status) {
  return TERMINAL_STATUSES.has(status);
}

export class TaskStore {
  /**
   * @param {object} [options]
   * @param {number} [options.terminalRetentionMs]
   * @param {number} [options.pollIntervalMs]
   */
  constructor(options = {}) {
    this.terminalRetentionMs =
      options.terminalRetentionMs ?? DEFAULT_TERMINAL_RETENTION_MS;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    // Running tasks have no TTL (ttl: 0 on set); a task only starts expiring
    // once it is terminal, so a long model call is never evicted mid-flight.
    this.tasks = new LRUCache({
      max: MAX_TASKS,
      ttlAutopurge: false,
      allowStale: false,
    });
  }

  /**
   * Create a task and start `run` in the background. Resolves once the task
   * record exists, before the work finishes, so the caller can answer the
   * tools/call with the handle immediately.
   * @param {object} params
   * @param {string} params.toolName
   * @param {string} [params.statusMessage]
   * @param {(signal: AbortSignal) => Promise<object>} params.run - Produces the CallToolResult
   * @returns {object} The CreateTaskResult wire object
   */
  create({ toolName, statusMessage, run }) {
    const now = new Date().toISOString();
    const record = {
      taskId: `task_${nanoid(21)}`,
      toolName,
      status: TASK_STATUS.WORKING,
      statusMessage,
      createdAt: now,
      lastUpdatedAt: now,
      controller: new AbortController(),
      result: undefined,
      error: undefined,
    };
    this.tasks.set(record.taskId, record, { ttl: 0 });

    logger.info('Task created', {
      data: { taskId: record.taskId, tool: toolName },
    });

    // Detached on purpose: the tools/call response must not wait for the work.
    Promise.resolve()
      .then(() => run(record.controller.signal))
      .then(
        (result) => this.#settle(record, TASK_STATUS.COMPLETED, { result }),
        (error) =>
          this.#settle(record, TASK_STATUS.FAILED, {
            error: {
              code: JSONRPC_INTERNAL_ERROR,
              message: error?.message || 'Task failed',
            },
          }),
      );

    return { resultType: 'task', ...this.#toWire(record) };
  }

  /**
   * The current task state for tasks/get, or undefined for an unknown ID.
   */
  get(taskId) {
    const record = this.tasks.get(taskId);
    if (!record) return undefined;

    const wire = { resultType: 'complete', ...this.#toWire(record) };
    if (record.status === TASK_STATUS.COMPLETED) {
      wire.result = record.result;
    } else if (record.status === TASK_STATUS.FAILED) {
      wire.error = record.error;
    }
    return wire;
  }

  /**
   * Cooperative cancellation for tasks/cancel. Returns false for an unknown ID.
   * A task that is already terminal keeps its status.
   */
  cancel(taskId) {
    const record = this.tasks.get(taskId);
    if (!record) return false;
    if (isTerminalStatus(record.status)) return true;

    record.controller.abort(new Error('Task cancelled by client'));
    this.#settle(record, TASK_STATUS.CANCELLED, {
      statusMessage: 'Cancelled by client',
    });
    return true;
  }

  /**
   * Abort every running task. Used on shutdown so in-flight provider calls stop.
   */
  abortAll(reason = 'Server shutting down') {
    for (const record of this.tasks.values()) {
      if (!isTerminalStatus(record.status)) {
        record.controller.abort(new Error(reason));
      }
    }
  }

  get size() {
    return this.tasks.size;
  }

  #settle(record, status, { result, error, statusMessage } = {}) {
    // The first terminal transition wins: a cancelled task whose work later
    // resolves (or rejects on the abort) stays cancelled.
    if (isTerminalStatus(record.status)) return;

    record.status = status;
    record.result = result;
    record.error = error;
    record.statusMessage = statusMessage;
    record.lastUpdatedAt = new Date().toISOString();
    this.tasks.set(record.taskId, record, { ttl: this.terminalRetentionMs });

    logger.info('Task settled', {
      data: {
        taskId: record.taskId,
        tool: record.toolName,
        status,
        isError: result?.isError === true,
      },
    });
  }

  #toWire(record) {
    const wire = {
      taskId: record.taskId,
      status: record.status,
      createdAt: record.createdAt,
      lastUpdatedAt: record.lastUpdatedAt,
      ttlMs: this.#ttlMs(record),
      pollIntervalMs: this.pollIntervalMs,
    };
    if (record.statusMessage) {
      wire.statusMessage = record.statusMessage;
    }
    return wire;
  }

  // The spec measures ttlMs from createdAt. A running task never expires here,
  // so it reports null; a terminal one is kept for the retention window past
  // the moment it settled.
  #ttlMs(record) {
    if (!isTerminalStatus(record.status)) return null;
    const settledAfterMs =
      Date.parse(record.lastUpdatedAt) - Date.parse(record.createdAt);
    return settledAfterMs + this.terminalRetentionMs;
  }
}

let taskStore = null;

export function getTaskStore() {
  if (!taskStore) {
    taskStore = new TaskStore();
  }
  return taskStore;
}

export function setTaskStore(store) {
  taskStore = store;
}
