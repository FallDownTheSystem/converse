/**
 * MCP Server factory
 *
 * The SDK builds a fresh Server per stdio connection, per modern (2026-07-28)
 * HTTP request, and per legacy HTTP session, and tells the factory which
 * protocol era the instance will serve. All instances share one router, so
 * dependencies and the task store live outside any single Server.
 */

import { Server } from '@modelcontextprotocol/server';
import { TASKS_EXTENSION_ID } from './async/taskStore.js';

/**
 * @param {object} router - Router from createRouter()
 * @param {object} mcpConfig - Result of getMcpClientConfig()
 * @returns {(ctx: { era: 'legacy'|'modern' }) => Server}
 */
export function createServerFactory(router, mcpConfig) {
  return ({ era } = {}) => {
    const capabilities = { ...mcpConfig.capabilities };
    // Tasks are only served on the modern era, where tasks/get, tasks/update
    // and tasks/cancel are registered; advertising them to a legacy client
    // would point it at the removed 2025-11-25 task methods.
    if (era === 'modern') {
      capabilities.extensions = { [TASKS_EXTENSION_ID]: {} };
    }

    const server = new Server(
      { name: mcpConfig.name, version: mcpConfig.version },
      { capabilities },
    );
    router.attach(server, { era });
    return server;
  };
}
