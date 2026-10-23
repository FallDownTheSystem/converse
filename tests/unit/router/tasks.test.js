/**
 * Router + server factory tests for the MCP Tasks extension, driven through the
 * SDK's web-standard handler so the real 2026-07-28 wire path (envelope
 * classification, standard-header validation, result stamping) is exercised
 * without a network listener or model calls.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { loadConfig, getMcpClientConfig } from '../../../src/config.js';
import { createRouter } from '../../../src/router.js';
import { createServerFactory } from '../../../src/serverFactory.js';
import { registerTool } from '../../../src/tools/index.js';
import { TASKS_EXTENSION_ID } from '../../../src/async/taskStore.js';

const PROTOCOL = '2026-07-28';

// A long-running tool the test controls: each call parks until released.
const pendingCalls = [];
async function slowTool(args, { signal }) {
  return new Promise((resolve) => {
    pendingCalls.push({ args, signal, resolve });
    signal?.addEventListener('abort', () =>
      resolve({ content: [{ type: 'text', text: 'aborted' }], isError: true }),
    );
  });
}

async function quickTool(args) {
  return { content: [{ type: 'text', text: `echo:${args.text}` }] };
}

let handler;
let nextId = 1;

function envelope(withTasks) {
  return {
    'io.modelcontextprotocol/protocolVersion': PROTOCOL,
    'io.modelcontextprotocol/clientInfo': { name: 'test', version: '1' },
    'io.modelcontextprotocol/clientCapabilities': withTasks
      ? { extensions: { [TASKS_EXTENSION_ID]: {} } }
      : {},
  };
}

async function readBody(response) {
  const text = await response.text();
  if ((response.headers.get('content-type') || '').includes('text/event-stream')) {
    const events = text
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => JSON.parse(line.slice(5)));
    return events.at(-1);
  }
  return JSON.parse(text);
}

async function modern(method, params, { withTasks = true, name } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    'MCP-Protocol-Version': PROTOCOL,
    'Mcp-Method': method,
  };
  if (name) headers['Mcp-Name'] = name;
  const response = await handler.fetch(
    new Request('http://localhost/mcp', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: nextId++,
        method,
        params: { ...params, _meta: envelope(withTasks) },
      }),
    }),
  );
  return readBody(response);
}

const callTool = (name, args, opts = {}) =>
  modern('tools/call', { name, arguments: args }, { ...opts, name });
const taskRequest = (method, taskId, opts = {}) =>
  modern(method, { taskId }, { ...opts, name: taskId });

async function waitForPendingCall(count) {
  for (let i = 0; i < 100 && pendingCalls.length < count; i++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  expect(pendingCalls.length).toBe(count);
  return pendingCalls[count - 1];
}

async function waitForStatus(taskId, status) {
  let task;
  for (let i = 0; i < 100; i++) {
    task = (await taskRequest('tasks/get', taskId)).result;
    if (task?.status === status) return task;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`task ${taskId} never reached ${status}: ${JSON.stringify(task)}`);
}

beforeAll(async () => {
  registerTool('test_slow', slowTool, {
    description: 'test long-running tool',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' }, async: { type: 'boolean' } },
      required: ['text'],
    },
  });
  slowTool.task = {
    eligible: (args) => args.async !== true,
    statusMessage: (args) => `slow: ${args.text}`,
  };
  registerTool('test_quick', quickTool, {
    description: 'test quick tool',
    inputSchema: { type: 'object', properties: { text: { type: 'string' } } },
  });

  const config = await loadConfig();
  const router = await createRouter(config);
  handler = createMcpHandler(
    createServerFactory(router, getMcpClientConfig(config)),
  );
});

describe('MCP tasks over protocol 2026-07-28', () => {
  it('advertises the tasks extension in server/discover', async () => {
    const response = await modern('server/discover', {}, { withTasks: false });
    expect(response.result.capabilities.extensions).toEqual({
      [TASKS_EXTENSION_ID]: {},
    });
  });

  it('answers a long-running call with a task and serves its lifecycle', async () => {
    const before = pendingCalls.length;
    const created = (await callTool('test_slow', { text: 'a' })).result;
    expect(created).toMatchObject({
      resultType: 'task',
      status: 'working',
      ttlMs: null,
      statusMessage: 'slow: a',
    });
    expect(typeof created.pollIntervalMs).toBe('number');

    const working = (await taskRequest('tasks/get', created.taskId)).result;
    expect(working).toMatchObject({
      resultType: 'complete',
      taskId: created.taskId,
      status: 'working',
    });

    const call = await waitForPendingCall(before + 1);
    call.resolve({ content: [{ type: 'text', text: 'done' }] });

    const completed = await waitForStatus(created.taskId, 'completed');
    expect(completed.result.content).toEqual([{ type: 'text', text: 'done' }]);
    expect(typeof completed.ttlMs).toBe('number');
  });

  it('cancels a running task and aborts its work', async () => {
    const before = pendingCalls.length;
    const created = (await callTool('test_slow', { text: 'b' })).result;
    const call = await waitForPendingCall(before + 1);

    const ack = await taskRequest('tasks/cancel', created.taskId);
    expect(ack.result.resultType).toBe('complete');
    expect(call.signal.aborted).toBe(true);

    const task = (await taskRequest('tasks/get', created.taskId)).result;
    expect(task.status).toBe('cancelled');
  });

  it('acks tasks/update for a known task', async () => {
    const created = (await callTool('test_slow', { text: 'c' })).result;
    const ack = await taskRequest('tasks/update', created.taskId);
    expect(ack.error).toBeUndefined();
    expect(ack.result.resultType).toBe('complete');
  });

  it('blocks and returns a plain result when the client did not declare tasks', async () => {
    const before = pendingCalls.length;
    const pending = callTool('test_slow', { text: 'd' }, { withTasks: false });
    const call = await waitForPendingCall(before + 1);
    call.resolve({ content: [{ type: 'text', text: 'sync' }] });

    const response = await pending;
    expect(response.result.resultType).toBe('complete');
    expect(response.result.content).toEqual([{ type: 'text', text: 'sync' }]);
  });

  it('never makes a task of a tool without a task policy', async () => {
    const response = await callTool('test_quick', { text: 'q' });
    expect(response.result.resultType).toBe('complete');
    expect(response.result.content).toEqual([{ type: 'text', text: 'echo:q' }]);
  });

  it('runs synchronously when the task policy declines the call', async () => {
    const before = pendingCalls.length;
    const pending = callTool('test_slow', { text: 'e', async: true });
    const call = await waitForPendingCall(before + 1);
    call.resolve({ content: [{ type: 'text', text: 'inline' }] });

    expect((await pending).result.resultType).toBe('complete');
  });

  it('reports invalid arguments on the call instead of creating a task', async () => {
    const response = await callTool('test_slow', { text: 7 });
    expect(response.result.resultType).toBe('complete');
    expect(response.result.isError).toBe(true);
  });

  it('rejects an unknown task ID with -32602', async () => {
    for (const method of ['tasks/get', 'tasks/update', 'tasks/cancel']) {
      const response = await taskRequest(method, 'task_unknown');
      expect(response.error.code).toBe(-32602);
    }
  });

  it('rejects tasks/* from a client that did not declare the extension', async () => {
    const created = (await callTool('test_slow', { text: 'f' })).result;
    const response = await taskRequest('tasks/get', created.taskId, {
      withTasks: false,
    });
    expect(response.error.code).toBe(-32021);
    expect(response.error.data.requiredCapabilities.extensions).toEqual({
      [TASKS_EXTENSION_ID]: {},
    });
  });
});

describe('legacy (initialize) era', () => {
  it('does not advertise the tasks extension', async () => {
    const response = await handler.fetch(
      new Request('http://localhost/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: nextId++,
          method: 'initialize',
          params: {
            protocolVersion: '2025-11-25',
            capabilities: {},
            clientInfo: { name: 'test', version: '1' },
          },
        }),
      }),
    );
    const body = await readBody(response);
    expect(body.result.capabilities.tools).toBeDefined();
    expect(body.result.capabilities.extensions).toBeUndefined();
  });
});
