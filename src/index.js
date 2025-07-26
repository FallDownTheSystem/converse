#!/usr/bin/env node

/**
 * Converse MCP Server - Main Entry Point
 *
 * Simplified, functional Node.js implementation of MCP server
 * with chat and consensus tools using modern Node.js practices.
 */

import { fileURLToPath } from 'url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig, validateRuntimeConfig, getMcpClientConfig, getHttpTransportConfig } from './config.js';
import { createRouter } from './router.js';
import { createHTTPTransport } from './transport/httpTransport.js';
import { createLogger, startTimer } from './utils/logger.js';
import { debugError } from './utils/console.js';
import { ConfigurationError } from './utils/errorHandler.js';

const logger = createLogger('server');

/**
 * Show help message
 */
function showHelp() {
  debugError(`
Converse MCP Server

Usage: node src/index.js [OPTIONS]

Options:
  --transport <type>    Transport type: http (default) or stdio
  --transport=<type>    Alternative format for transport type
  --help               Show this help message

Environment Variables:
  MCP_TRANSPORT        Transport type (http or stdio)
  PORT                 HTTP server port (default: 3157)
  HOST                 HTTP server host (default: localhost)

Examples:
  node src/index.js                    # Start with HTTP transport (default)
  node src/index.js --transport http   # Start with HTTP transport
  node src/index.js --transport stdio  # Start with stdio transport
  npm start                           # Start with HTTP transport
  MCP_TRANSPORT=stdio npm start       # Start with stdio transport
`);
}

/**
 * Determine transport type from command line arguments or environment
 */
function getTransportType() {
  // Check command line arguments
  const args = process.argv.slice(2);

  // Support --transport=value format
  const transportEqualArg = args.find(arg => arg.startsWith('--transport='));
  if (transportEqualArg) {
    const transport = transportEqualArg.split('=')[1];
    if (transport && ['http', 'stdio'].includes(transport)) {
      return transport;
    }
  }

  // Support --transport value format
  const transportIndex = args.findIndex(arg => arg === '--transport');
  if (transportIndex >= 0 && transportIndex + 1 < args.length) {
    const transport = args[transportIndex + 1];
    if (transport && ['http', 'stdio'].includes(transport)) {
      return transport;
    }
  }

  // Check environment variable
  if (process.env.MCP_TRANSPORT) {
    const transport = process.env.MCP_TRANSPORT.toLowerCase();
    if (['http', 'stdio'].includes(transport)) {
      return transport;
    }
  }

  // Default to HTTP for better development experience
  return 'http';
}

async function main() {
  // Check for help flag
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }

  // Determine transport type first to configure logging appropriately
  const transportType = getTransportType();

  // Set environment variable early for stdio transport to suppress console output
  if (transportType === 'stdio') {
    process.env.MCP_TRANSPORT = 'stdio';
    // Reconfigure logger with updated environment
    const { configureLogger } = await import('./utils/logger.js');
    configureLogger({
      level: process.env.LOG_LEVEL || 'info',
      isDevelopment: process.env.NODE_ENV === 'development'
    });
  }

  const serverTimer = startTimer('server-startup', 'server');

  try {
    logger.info('Starting Converse MCP Server');

    // Load and validate configuration
    const config = await loadConfig();
    await validateRuntimeConfig(config);

    // Get MCP client configuration
    const mcpConfig = getMcpClientConfig(config);

    logger.info('Using transport type', { data: { transport: transportType } });

    logger.debug('Creating MCP server instance', {
      data: { name: mcpConfig.name, version: mcpConfig.version }
    });

    // Create MCP server with configuration
    const server = new Server(
      {
        name: mcpConfig.name,
        version: mcpConfig.version,
      },
      mcpConfig
    );

    // Set up router with server and config
    await createRouter(server, config);

    // Start server with appropriate transport
    if (transportType === 'http') {
      // HTTP streaming transport with full configuration
      const httpConfig = getHttpTransportConfig(config);
      const httpTransport = await createHTTPTransport(server, httpConfig);

      await httpTransport.start();
      const status = httpTransport.getStatus();

      const startupTime = serverTimer('completed');
      logger.info('Converse MCP Server started successfully with HTTP transport', {
        data: {
          startupTime: `${startupTime}ms`,
          endpoint: `http://${status.host}:${status.port}/mcp`,
          host: status.host,
          port: status.port
        }
      });

      // Store reference for shutdown
      process.httpTransport = httpTransport;
    } else {
      // Stdio transport (legacy)
      const transport = new StdioServerTransport();
      await server.connect(transport);

      const startupTime = serverTimer('completed');
      logger.info('Converse MCP Server started successfully with stdio transport', {
        data: { startupTime: `${startupTime}ms` }
      });
    }
  } catch (error) {
    serverTimer('failed');

    if (error instanceof ConfigurationError) {
      logger.error('Configuration error during startup', { error });
      debugError('Configuration Error:');
      debugError(error.message);
      if (error.details?.errors) {
        debugError('\nDetailed errors:');
        error.details.errors.forEach(err => debugError(`  - ${err}`));
      }
      process.exit(1);
    } else {
      logger.error('Failed to start Converse MCP Server', { error });
      debugError('Failed to start Converse MCP Server:', error.message);
      process.exit(1);
    }
  }
}

// Handle graceful shutdown
async function gracefulShutdown(signal) {
  logger.info(`Received ${signal}, shutting down gracefully`);
  debugError('Shutting down Converse MCP Server...');

  if (process.httpTransport) {
    try {
      await process.httpTransport.stop();
      logger.info('HTTP transport stopped successfully');
    } catch (error) {
      logger.error('Error stopping HTTP transport', { error });
    }
  }

  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error });
  debugError('Fatal error:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled promise rejection', {
    error: reason,
    data: { promise: promise.toString() }
  });
  debugError('Unhandled promise rejection:', reason);
  process.exit(1);
});

// Export the main function for use in bin/converse.js
export { main };

// Check if this module is the main entry point
// This works better across platforms and Node.js versions
const isMainModule = import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` ||
                     process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
  main().catch((error) => {
    logger.error('Fatal error in main', { error });
    debugError('Fatal error:', error);
    process.exit(1);
  });
}
