/**
 * Authentication Middleware for MCP HTTP Transport
 * 
 * Provides OAuth 2.0 and token-based authentication for remote MCP server deployments.
 * Supports multiple authentication strategies following MCP SDK patterns.
 */

import express from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('auth-middleware');

/**
 * Authentication strategies enum
 */
export const AuthStrategy = {
  NONE: 'none',
  BEARER_TOKEN: 'bearer',
  OAUTH2: 'oauth2',
  API_KEY: 'api_key',
  CUSTOM: 'custom'
};

/**
 * Authentication configuration
 */
export class AuthConfig {
  constructor(config = {}) {
    this.strategy = config.strategy || AuthStrategy.NONE;
    this.jwtSecret = config.jwtSecret || process.env.MCP_JWT_SECRET;
    this.jwtOptions = config.jwtOptions || {
      algorithm: 'HS256',
      expiresIn: '24h',
      issuer: 'converse-mcp-server'
    };
    this.apiKeys = config.apiKeys || [];
    this.oauth2 = config.oauth2 || {
      clientId: process.env.MCP_OAUTH_CLIENT_ID,
      clientSecret: process.env.MCP_OAUTH_CLIENT_SECRET,
      authorizationUrl: process.env.MCP_OAUTH_AUTH_URL,
      tokenUrl: process.env.MCP_OAUTH_TOKEN_URL,
      callbackUrl: process.env.MCP_OAUTH_CALLBACK_URL || '/oauth/callback',
      scope: process.env.MCP_OAUTH_SCOPE || 'openid profile email',
      userInfoUrl: process.env.MCP_OAUTH_USERINFO_URL
    };
    this.customValidator = config.customValidator;
    this.allowedOrigins = config.allowedOrigins || [];
    this.requireAuth = config.requireAuth !== false;
    
    // Session-based auth settings
    this.sessionAuth = config.sessionAuth || {
      enabled: true,
      requireAuthForSession: false, // Allow session creation without auth
      requireAuthForOperations: true // Require auth for actual operations
    };
  }
}

/**
 * Authentication middleware factory
 */
export class AuthMiddleware {
  constructor(authConfig = new AuthConfig()) {
    this.config = authConfig;
    this.sessions = new Map(); // sessionId -> auth info
  }

  /**
   * Get Express middleware function
   */
  getMiddleware() {
    return async (req, res, next) => {
      // Skip auth for health/info endpoints
      if (['/health', '/info', '/oauth/callback'].includes(req.path)) {
        return next();
      }

      // Handle OPTIONS requests for CORS
      if (req.method === 'OPTIONS') {
        return next();
      }

      try {
        const authResult = await this.authenticate(req);
        
        if (authResult.authenticated) {
          req.auth = authResult;
          
          // Store auth info with session if present
          const sessionId = req.headers['mcp-session-id'];
          if (sessionId) {
            this.sessions.set(sessionId, authResult);
          }
          
          return next();
        }
        
        // Check if auth is required based on context
        if (this.shouldRequireAuth(req)) {
          logger.warn('Authentication failed', {
            data: {
              strategy: this.config.strategy,
              path: req.path,
              method: req.method
            }
          });
          
          res.status(401).json({
            jsonrpc: '2.0',
            error: {
              code: -32001,
              message: 'Authentication required',
              data: {
                strategy: this.config.strategy,
                realm: 'MCP Server'
              }
            },
            id: null
          });
          return;
        }
        
        // Auth not required for this request
        next();
        
      } catch (error) {
        logger.error('Authentication error', { error });
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal authentication error'
          },
          id: null
        });
      }
    };
  }

  /**
   * Determine if authentication should be required for a request
   */
  shouldRequireAuth(req) {
    if (!this.config.requireAuth) {
      return false;
    }

    // Session-based auth logic
    if (this.config.sessionAuth.enabled) {
      const sessionId = req.headers['mcp-session-id'];
      const isInitRequest = req.body?.method === 'initialize';
      
      // Allow session creation without auth if configured
      if (isInitRequest && !this.config.sessionAuth.requireAuthForSession) {
        return false;
      }
      
      // Require auth for operations if configured
      if (!isInitRequest && this.config.sessionAuth.requireAuthForOperations) {
        return true;
      }
    }

    return this.config.requireAuth;
  }

  /**
   * Authenticate a request based on configured strategy
   */
  async authenticate(req) {
    switch (this.config.strategy) {
      case AuthStrategy.NONE:
        return { authenticated: true, strategy: AuthStrategy.NONE };
        
      case AuthStrategy.BEARER_TOKEN:
        return await this.authenticateBearer(req);
        
      case AuthStrategy.API_KEY:
        return await this.authenticateApiKey(req);
        
      case AuthStrategy.OAUTH2:
        return await this.authenticateOAuth2(req);
        
      case AuthStrategy.CUSTOM:
        return await this.authenticateCustom(req);
        
      default:
        throw new Error(`Unknown authentication strategy: ${this.config.strategy}`);
    }
  }

  /**
   * Bearer token authentication
   */
  async authenticateBearer(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { authenticated: false, strategy: AuthStrategy.BEARER_TOKEN };
    }

    const token = authHeader.substring(7);
    
    try {
      const decoded = jwt.verify(token, this.config.jwtSecret, {
        algorithms: [this.config.jwtOptions.algorithm],
        issuer: this.config.jwtOptions.issuer
      });
      
      return {
        authenticated: true,
        strategy: AuthStrategy.BEARER_TOKEN,
        user: decoded,
        token
      };
    } catch (error) {
      logger.debug('JWT verification failed', { error: error.message });
      return { authenticated: false, strategy: AuthStrategy.BEARER_TOKEN };
    }
  }

  /**
   * API key authentication
   */
  async authenticateApiKey(req) {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;
    
    if (!apiKey) {
      return { authenticated: false, strategy: AuthStrategy.API_KEY };
    }

    const isValid = this.config.apiKeys.includes(apiKey);
    
    return {
      authenticated: isValid,
      strategy: AuthStrategy.API_KEY,
      apiKey: isValid ? apiKey : undefined
    };
  }

  /**
   * OAuth 2.0 authentication
   */
  async authenticateOAuth2(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { authenticated: false, strategy: AuthStrategy.OAUTH2 };
    }

    const token = authHeader.substring(7);
    
    // For OAuth2, we need to validate the token with the provider
    // This is a simplified implementation - in production, you'd validate
    // with the OAuth provider's token introspection endpoint
    try {
      // Check if it's a JWT we issued after OAuth flow
      if (this.config.jwtSecret) {
        const decoded = jwt.verify(token, this.config.jwtSecret, {
          algorithms: [this.config.jwtOptions.algorithm],
          issuer: this.config.jwtOptions.issuer
        });
        
        if (decoded.oauth2) {
          return {
            authenticated: true,
            strategy: AuthStrategy.OAUTH2,
            user: decoded,
            token
          };
        }
      }
      
      return { authenticated: false, strategy: AuthStrategy.OAUTH2 };
    } catch (error) {
      logger.debug('OAuth2 token validation failed', { error: error.message });
      return { authenticated: false, strategy: AuthStrategy.OAUTH2 };
    }
  }

  /**
   * Custom authentication
   */
  async authenticateCustom(req) {
    if (!this.config.customValidator) {
      throw new Error('Custom validator not configured');
    }

    const result = await this.config.customValidator(req);
    
    return {
      authenticated: !!result.authenticated,
      strategy: AuthStrategy.CUSTOM,
      ...result
    };
  }

  /**
   * Generate JWT token for authenticated user
   */
  generateToken(payload) {
    if (!this.config.jwtSecret) {
      throw new Error('JWT secret not configured');
    }

    return jwt.sign(payload, this.config.jwtSecret, this.config.jwtOptions);
  }

  /**
   * OAuth 2.0 authorization URL
   */
  getAuthorizationUrl(state) {
    if (this.config.strategy !== AuthStrategy.OAUTH2) {
      throw new Error('OAuth2 not configured');
    }

    const params = new URLSearchParams({
      client_id: this.config.oauth2.clientId,
      response_type: 'code',
      redirect_uri: this.config.oauth2.callbackUrl,
      scope: this.config.oauth2.scope,
      state: state || ''
    });

    return `${this.config.oauth2.authorizationUrl}?${params.toString()}`;
  }

  /**
   * Handle OAuth callback
   */
  async handleOAuthCallback(code, state) {
    // Exchange code for token
    const tokenResponse = await fetch(this.config.oauth2.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${this.config.oauth2.clientId}:${this.config.oauth2.clientSecret}`).toString('base64')}`
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.config.oauth2.callbackUrl
      })
    });

    if (!tokenResponse.ok) {
      throw new Error('Failed to exchange code for token');
    }

    const tokens = await tokenResponse.json();
    
    // Get user info if configured
    let userInfo = {};
    if (this.config.oauth2.userInfoUrl && tokens.access_token) {
      const userResponse = await fetch(this.config.oauth2.userInfoUrl, {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`
        }
      });
      
      if (userResponse.ok) {
        userInfo = await userResponse.json();
      }
    }

    // Generate our own JWT with OAuth info
    const mcpToken = this.generateToken({
      oauth2: true,
      sub: userInfo.sub || userInfo.id || 'oauth2-user',
      email: userInfo.email,
      name: userInfo.name,
      oauth_provider: 'external',
      oauth_access_token: tokens.access_token,
      oauth_token_type: tokens.token_type,
      oauth_expires_in: tokens.expires_in
    });

    return {
      mcpToken,
      oauthTokens: tokens,
      userInfo
    };
  }

  /**
   * Clean up session auth info
   */
  cleanupSession(sessionId) {
    this.sessions.delete(sessionId);
  }
}

/**
 * Create authentication middleware with configuration
 */
export function createAuthMiddleware(config) {
  const authMiddleware = new AuthMiddleware(config);
  return authMiddleware.getMiddleware();
}

/**
 * Express router for OAuth endpoints
 */
export function createOAuthRouter(authMiddleware) {
  const router = express.Router();

  // OAuth authorization endpoint
  router.get('/oauth/authorize', (req, res) => {
    const state = req.query.state || crypto.randomUUID();
    const authUrl = authMiddleware.getAuthorizationUrl(state);
    res.redirect(authUrl);
  });

  // OAuth callback endpoint
  router.get('/oauth/callback', async (req, res) => {
    try {
      const { code, state } = req.query;
      
      if (!code) {
        return res.status(400).json({
          error: 'Missing authorization code'
        });
      }

      const result = await authMiddleware.handleOAuthCallback(code, state);
      
      // Return token to client
      res.json({
        access_token: result.mcpToken,
        token_type: 'Bearer',
        expires_in: 86400, // 24 hours
        user: result.userInfo
      });
      
    } catch (error) {
      logger.error('OAuth callback error', { error });
      res.status(500).json({
        error: 'OAuth callback failed'
      });
    }
  });

  return router;
}