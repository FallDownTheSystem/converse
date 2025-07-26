/**
 * HTTP Streaming Transport for MCP Server
 *
 * Implements StreamableHTTPServerTransport to replace stdio transport,
 * eliminating console output interference and providing better local development experience.
 */

import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('http-transport');

/**
 * HTTP Transport Server for MCP
 * Manages Express server with MCP endpoints and session management
 */
export class HTTPTransportServer {
  constructor(config = {}) {
    this.config = {
      // Server settings
      port: config.port || 3157,
      host: config.host || 'localhost',
      requestTimeout: config.requestTimeout || 300000,
      maxRequestSize: config.maxRequestSize || '10mb',

      // Session management
      sessionTimeout: config.sessionTimeout || 1800000,
      sessionCleanupInterval: config.sessionCleanupInterval || 300000,
      maxConcurrentSessions: config.maxConcurrentSessions || 100,

      // CORS configuration
      enableCors: config.enableCors !== false,
      corsOptions: config.corsOptions || {
        origin: '*',
        methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'mcp-session-id', 'Authorization'],
        credentials: false,
        exposedHeaders: ['Mcp-Session-Id'],
      },

      // Security settings
      enableDnsRebindingProtection: config.enableDnsRebindingProtection || false,
      allowedHosts: config.allowedHosts || ['127.0.0.1', 'localhost'],
      rateLimitEnabled: config.rateLimitEnabled || false,
      rateLimitWindow: config.rateLimitWindow || 900000,
      rateLimitMaxRequests: config.rateLimitMaxRequests || 1000,

      ...config
    };

    this.app = express();
    this.server = null;
    this.transports = new Map(); // sessionId -> transport
    this.sessionTimers = new Map(); // sessionId -> timeout timer
    this.mcpServer = null;
    this.isStarted = false;
    this.cleanupInterval = null;
  }

  /**
   * Initialize the HTTP transport server
   * @param {object} mcpServer - MCP Server instance
   */
  async initialize(mcpServer) {
    this.mcpServer = mcpServer;
    this.setupMiddleware();
    this.setupRoutes();
    return this;
  }

  /**
   * Setup Express middleware
   */
  setupMiddleware() {
    // JSON parsing with size limit
    this.app.use(express.json({
      limit: this.config.maxRequestSize,
      strict: true
    }));

    // Request timeout middleware
    this.app.use((req, res, next) => {
      req.setTimeout(this.config.requestTimeout, () => {
        logger.warn('Request timeout', {
          data: {
            method: req.method,
            path: req.path,
            timeout: this.config.requestTimeout
          }
        });
        if (!res.headersSent) {
          res.status(408).json({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Request timeout',
            },
            id: null,
          });
        }
      });
      next();
    });

    // Rate limiting middleware (if enabled)
    if (this.config.rateLimitEnabled) {
      const rateLimitMap = new Map();

      this.app.use((req, res, next) => {
        const clientId = req.ip || req.connection.remoteAddress;
        const now = Date.now();
        const windowStart = now - this.config.rateLimitWindow;

        // Clean old entries
        const clientRequests = rateLimitMap.get(clientId) || [];
        const validRequests = clientRequests.filter(time => time > windowStart);

        if (validRequests.length >= this.config.rateLimitMaxRequests) {
          logger.warn('Rate limit exceeded', {
            data: {
              clientId,
              requests: validRequests.length,
              limit: this.config.rateLimitMaxRequests
            }
          });
          res.status(429).json({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Rate limit exceeded',
            },
            id: null,
          });
          return;
        }

        validRequests.push(now);
        rateLimitMap.set(clientId, validRequests);
        next();
      });

      logger.debug('Rate limiting enabled', {
        data: {
          window: this.config.rateLimitWindow,
          maxRequests: this.config.rateLimitMaxRequests
        }
      });
    }

    // CORS configuration for browser clients
    if (this.config.enableCors) {
      this.app.use(cors(this.config.corsOptions));
      logger.debug('CORS enabled for HTTP transport', {
        data: { corsOptions: this.config.corsOptions }
      });
    }

    // Request logging
    this.app.use((req, res, next) => {
      logger.debug('HTTP request received', {
        data: {
          method: req.method,
          path: req.path,
          sessionId: req.headers['mcp-session-id']
        }
      });
      next();
    });
  }

  /**
   * Setup MCP HTTP routes
   */
  setupRoutes() {
    // Main MCP endpoint - handles POST requests for client-to-server communication
    this.app.post('/mcp', async (req, res) => {
      await this.handleMcpRequest(req, res);
    });

    // SSE endpoint - handles GET requests for server-to-client notifications
    this.app.get('/mcp', async (req, res) => {
      await this.handleSseRequest(req, res);
    });

    // Session termination - handles DELETE requests
    this.app.delete('/mcp', async (req, res) => {
      await this.handleSessionTermination(req, res);
    });

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        transport: 'http',
        server: this.mcpServer ? 'connected' : 'disconnected',
        sessions: this.transports.size,
        timestamp: new Date().toISOString()
      });
    });

    // Server info endpoint
    this.app.get('/info', (req, res) => {
      res.json({
        name: this.mcpServer?.serverCapabilities?.name || 'unknown',
        version: this.mcpServer?.serverCapabilities?.version || 'unknown',
        transport: 'http-streaming',
        endpoints: {
          mcp: '/mcp',
          health: '/health',
          info: '/info'
        },
        sessions: this.transports.size
      });
    });
  }

  /**
   * Handle MCP POST requests (client-to-server communication)
   */
  async handleMcpRequest(req, res) {
    try {
      const sessionId = req.headers['mcp-session-id'];
      let transport;

      if (sessionId && this.transports.has(sessionId)) {
        // Reuse existing transport and reset session timeout
        transport = this.transports.get(sessionId);
        this.resetSessionTimeout(sessionId);
        logger.debug('Reusing existing transport', { data: { sessionId } });
      } else if (!sessionId && isInitializeRequest(req.body)) {
        // Check session limit before creating new transport
        if (this.transports.size >= this.config.maxConcurrentSessions) {
          logger.warn('Maximum concurrent sessions reached', {
            data: {
              currentSessions: this.transports.size,
              maxSessions: this.config.maxConcurrentSessions
            }
          });
          res.status(503).json({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Maximum concurrent sessions reached. Please try again later.',
            },
            id: null,
          });
          return;
        }

        // New initialization request
        transport = await this.createNewTransport();
        logger.info('Created new MCP transport', {});
      } else {
        // Invalid request
        logger.warn('Invalid MCP request - no session ID or not initialize request', {
          data: { sessionId, hasInitialize: isInitializeRequest(req.body) }
        });
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided',
          },
          id: null,
        });
        return;
      }

      // Handle the request through the transport
      await transport.handleRequest(req, res, req.body);

    } catch (error) {
      logger.error('Error handling MCP request', { error });
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  }

  /**
   * Handle SSE GET requests (server-to-client notifications)
   */
  async handleSseRequest(req, res) {
    const sessionId = req.headers['mcp-session-id'];

    if (!sessionId || !this.transports.has(sessionId)) {
      logger.warn('SSE request with invalid session ID', { data: { sessionId } });
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    try {
      const transport = this.transports.get(sessionId);
      this.resetSessionTimeout(sessionId);
      await transport.handleRequest(req, res);
      logger.debug('SSE connection established', { data: { sessionId } });
    } catch (error) {
      logger.error('Error handling SSE request', { error, data: { sessionId } });
      if (!res.headersSent) {
        res.status(500).send('Internal server error');
      }
    }
  }

  /**
   * Handle session termination DELETE requests
   */
  async handleSessionTermination(req, res) {
    const sessionId = req.headers['mcp-session-id'];

    if (!sessionId || !this.transports.has(sessionId)) {
      logger.warn('Session termination with invalid session ID', { data: { sessionId } });
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    try {
      const transport = this.transports.get(sessionId);
      await transport.handleRequest(req, res);

      // Clean up the transport
      this.transports.delete(sessionId);
      logger.info('Session terminated', { data: { sessionId } });
    } catch (error) {
      logger.error('Error terminating session', { error, data: { sessionId } });
      if (!res.headersSent) {
        res.status(500).send('Internal server error');
      }
    }
  }

  /**
   * Create a new MCP transport with session management
   */
  async createNewTransport() {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        this.transports.set(sessionId, transport);
        this.setupSessionTimeout(sessionId);
        logger.debug('Transport session initialized', { data: { sessionId } });
      },
      enableDnsRebindingProtection: this.config.enableDnsRebindingProtection,
      allowedHosts: this.config.allowedHosts,
    });

    // Clean up transport when closed
    transport.onclose = () => {
      if (transport.sessionId) {
        this.cleanupSession(transport.sessionId);
        logger.debug('Transport session closed', {
          data: { sessionId: transport.sessionId }
        });
      }
    };

    // Connect to the MCP server
    await this.mcpServer.connect(transport);

    return transport;
  }

  /**
   * Setup session timeout for a given session
   */
  setupSessionTimeout(sessionId) {
    // Clear existing timeout if any
    if (this.sessionTimers.has(sessionId)) {
      clearTimeout(this.sessionTimers.get(sessionId));
    }

    // Set new timeout
    const timeoutId = setTimeout(() => {
      logger.info('Session timeout expired', { data: { sessionId } });
      this.cleanupSession(sessionId);
    }, this.config.sessionTimeout);

    this.sessionTimers.set(sessionId, timeoutId);
  }

  /**
   * Reset session timeout for active session
   */
  resetSessionTimeout(sessionId) {
    if (this.transports.has(sessionId)) {
      this.setupSessionTimeout(sessionId);
    }
  }

  /**
   * Clean up session resources
   * Note: Following MCP SDK pattern - only clean up our references,
   * let transport.onclose handle its own cleanup
   */
  cleanupSession(sessionId) {
    // Clear timeout
    if (this.sessionTimers.has(sessionId)) {
      clearTimeout(this.sessionTimers.get(sessionId));
      this.sessionTimers.delete(sessionId);
    }

    // Remove transport from our map (don't call transport.close() here)
    if (this.transports.has(sessionId)) {
      this.transports.delete(sessionId);
      logger.debug('Transport session cleaned up', { data: { sessionId } });
    }
  }

  /**
   * Periodic cleanup of expired sessions
   */
  startSessionCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(() => {
      logger.debug('Running session cleanup', {
        data: { activeSessions: this.transports.size }
      });

      // The timeout mechanism handles cleanup automatically,
      // but we can add additional checks here if needed
    }, this.config.sessionCleanupInterval);
  }

  /**
   * Start the HTTP server
   */
  async start() {
    if (this.isStarted) {
      throw new Error('HTTP transport server is already started');
    }

    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.config.port, this.config.host, (err) => {
        if (err) {
          logger.error('Failed to start HTTP transport server', { error: err });
          reject(err);
          return;
        }

        this.isStarted = true;
        this.startSessionCleanup();

        const address = this.server.address();
        logger.info('HTTP transport server started', {
          data: {
            host: address.address,
            port: address.port,
            endpoint: `http://${this.config.host}:${address.port}/mcp`,
            sessionTimeout: this.config.sessionTimeout,
            maxSessions: this.config.maxConcurrentSessions
          }
        });
        resolve(address);
      });
    });
  }

  /**
   * Stop the HTTP server
   */
  async stop() {
    if (!this.isStarted || !this.server) {
      return;
    }

    return new Promise((resolve) => {
      // Stop session cleanup interval
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
        this.cleanupInterval = null;
      }

      // Clear all session timers
      for (const [sessionId, timeoutId] of this.sessionTimers) {
        clearTimeout(timeoutId);
      }
      this.sessionTimers.clear();

      // Clear transport references (let the server close handle actual transport cleanup)
      this.transports.clear();

      // Close all active connections first to prevent hanging handles
      if (this.server.listening) {
        this.server.closeAllConnections?.(); // Available in Node 18.02+
      }

      this.server.close((err) => {
        this.isStarted = false;
        if (err) {
          logger.warn('Error closing HTTP server', { error: err });
        } else {
          logger.info('HTTP transport server stopped');
        }
        resolve();
      });
    });
  }

  /**
   * Get server status information
   */
  getStatus() {
    return {
      isStarted: this.isStarted,
      port: this.config.port,
      host: this.config.host,
      activeSessions: this.transports.size,
      maxSessions: this.config.maxConcurrentSessions,
      sessionIds: Array.from(this.transports.keys()),
      address: this.server?.address() || null,
      configuration: {
        sessionTimeout: this.config.sessionTimeout,
        sessionCleanupInterval: this.config.sessionCleanupInterval,
        requestTimeout: this.config.requestTimeout,
        maxRequestSize: this.config.maxRequestSize,
        corsEnabled: this.config.enableCors,
        rateLimitEnabled: this.config.rateLimitEnabled,
        dnsRebindingProtection: this.config.enableDnsRebindingProtection
      }
    };
  }
}

/**
 * Factory function to create and configure HTTP transport server
 * @param {object} mcpServer - MCP Server instance
 * @param {object} config - HTTP transport configuration
 * @returns {Promise<HTTPTransportServer>}
 */
export async function createHTTPTransport(mcpServer, config = {}) {
  const httpTransport = new HTTPTransportServer(config);
  await httpTransport.initialize(mcpServer);
  return httpTransport;
}
