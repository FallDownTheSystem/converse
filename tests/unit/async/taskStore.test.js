/**
 * Unit tests for the MCP Tasks extension store.
 */

import { setImmediate } from 'node:timers';
import { describe, it, expect } from 'vitest';
import {
  TaskStore,
  TASK_STATUS,
  TASKS_EXTENSION_ID,
  clientSupportsTasks,
} from '../../../src/async/taskStore.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('TaskStore', () => {
  it('creates a task handle with every field Claude Code requires', () => {
    const store = new TaskStore({ pollIntervalMs: 1500 });
    const handle = store.create({
      toolName: 'chat',
      statusMessage: 'chat: auto',
      run: () => new Promise(() => {}),
    });

    expect(handle).toMatchObject({
      resultType: 'task',
      status: TASK_STATUS.WORKING,
      ttlMs: null,
      pollIntervalMs: 1500,
      statusMessage: 'chat: auto',
    });
    expect(handle.createdAt).toBe(handle.lastUpdatedAt);
    expect(Number.isNaN(Date.parse(handle.createdAt))).toBe(false);
    // At most 128 printable ASCII characters with no spaces.
    expect(handle.taskId).toMatch(/^[\x21-\x7E]{1,128}$/);
  });

  it('is answerable via get() as soon as create() returns', () => {
    const store = new TaskStore();
    const { taskId } = store.create({
      toolName: 'chat',
      run: () => new Promise(() => {}),
    });

    expect(store.get(taskId)).toMatchObject({
      resultType: 'complete',
      taskId,
      status: TASK_STATUS.WORKING,
    });
    expect(store.get(taskId)).not.toHaveProperty('result');
  });

  it('completes with the tool result unchanged', async () => {
    const store = new TaskStore({ terminalRetentionMs: 60_000 });
    const work = deferred();
    const { taskId } = store.create({ toolName: 'chat', run: () => work.promise });

    const callToolResult = { content: [{ type: 'text', text: 'PONG' }] };
    work.resolve(callToolResult);
    await flush();

    const task = store.get(taskId);
    expect(task.status).toBe(TASK_STATUS.COMPLETED);
    expect(task.result).toEqual(callToolResult);
    expect(task).not.toHaveProperty('statusMessage');
    const settledAfterMs =
      Date.parse(task.lastUpdatedAt) - Date.parse(task.createdAt);
    expect(task.ttlMs).toBe(settledAfterMs + 60_000);
  });

  it('reports a tool-level error as completed, not failed', async () => {
    const store = new TaskStore();
    const errorResult = {
      content: [{ type: 'text', text: 'Unknown model' }],
      isError: true,
    };
    const { taskId } = store.create({
      toolName: 'chat',
      run: async () => errorResult,
    });
    await flush();

    expect(store.get(taskId)).toMatchObject({
      status: TASK_STATUS.COMPLETED,
      result: errorResult,
    });
  });

  it('marks the task failed with a JSON-RPC error when the work throws', async () => {
    const store = new TaskStore();
    const { taskId } = store.create({
      toolName: 'chat',
      run: async () => {
        throw new Error('boom');
      },
    });
    await flush();

    const task = store.get(taskId);
    expect(task.status).toBe(TASK_STATUS.FAILED);
    expect(task.error).toEqual({ code: -32603, message: 'boom' });
    expect(task).not.toHaveProperty('result');
  });

  it('aborts the work on cancel and keeps the cancelled status', async () => {
    const store = new TaskStore();
    const work = deferred();
    let signal;
    const { taskId } = store.create({
      toolName: 'chat',
      run: (s) => {
        signal = s;
        return work.promise;
      },
    });
    await flush();

    expect(store.cancel(taskId)).toBe(true);
    expect(signal.aborted).toBe(true);

    // The work resolving after cancellation must not overwrite the status.
    work.resolve({ content: [{ type: 'text', text: 'late' }] });
    await flush();

    const task = store.get(taskId);
    expect(task.status).toBe(TASK_STATUS.CANCELLED);
    expect(task.statusMessage).toBe('Cancelled by client');
    expect(task).not.toHaveProperty('result');
  });

  it('leaves a terminal task untouched on cancel', async () => {
    const store = new TaskStore();
    const { taskId } = store.create({
      toolName: 'chat',
      run: async () => ({ content: [] }),
    });
    await flush();

    expect(store.cancel(taskId)).toBe(true);
    expect(store.get(taskId).status).toBe(TASK_STATUS.COMPLETED);
  });

  it('returns undefined / false for unknown task IDs', () => {
    const store = new TaskStore();
    expect(store.get('task_missing')).toBeUndefined();
    expect(store.cancel('task_missing')).toBe(false);
  });

  it('aborts every running task on abortAll', async () => {
    const store = new TaskStore();
    const signals = [];
    for (let i = 0; i < 2; i++) {
      store.create({
        toolName: 'chat',
        run: (s) => {
          signals.push(s);
          return new Promise(() => {});
        },
      });
    }
    await flush();

    store.abortAll();
    expect(signals.every((s) => s.aborted)).toBe(true);
  });
});

describe('clientSupportsTasks', () => {
  const caps = (extensions) => ({
    'io.modelcontextprotocol/clientCapabilities': { extensions },
  });

  it('is true only when the tasks extension is declared', () => {
    expect(clientSupportsTasks(caps({ [TASKS_EXTENSION_ID]: {} }))).toBe(true);
    expect(clientSupportsTasks(caps({ 'other/ext': {} }))).toBe(false);
    expect(clientSupportsTasks(caps(undefined))).toBe(false);
    expect(clientSupportsTasks({})).toBe(false);
    expect(clientSupportsTasks(undefined)).toBe(false);
  });
});
