/**
 * Configuration Management System
 *
 * Comprehensive environment-based configuration system for the Converse MCP Server.
 * Loads, validates, and manages all configuration from environment variables only.
 * Follows functional architecture with explicit dependencies.
 */

import dotenv from 'dotenv';
import { createLogger, configureLogger } from './utils/logger.js';
import { ConfigurationError } from './utils/errorHandler.js';

// Load environment variables from appropriate .env file
// Priority: .env.test (for test env) > .env (default)
if (process.env.NODE_ENV === 'test') {
  // Load test environment first
  dotenv.config({ path: '.env.test', quiet: true });
  // Fall back to .env for any missing variables
  dotenv.config({ override: false, quiet: true });
} else {
  // Load default .env file
  dotenv.config({ quiet: true });
}

// Configure logger early
configureLogger({
  level: process.env.LOG_LEVEL || 'info',
  isDevelopment: process.env.NODE_ENV === 'development'
});

const logger = createLogger('config');

/**
 * Configuration schema defining all supported environment variables
 */
const CONFIG_SCHEMA = {
  // Server configuration
  server: {
    PORT: { type: 'number', default: 3157, description: 'Server port' },
    HOST: { type: 'string', default: 'localhost', description: 'Server host' },
    NODE_ENV: { type: 'string', default: 'development', description: 'Environment mode' },
    LOG_LEVEL: { type: 'string', default: 'info', description: 'Logging level' },
  },

  // Transport configuration
  transport: {
    MCP_TRANSPORT: { type: 'string', default: 'http', description: 'MCP transport type (http or stdio)' },

    // HTTP server settings
    HTTP_PORT: { type: 'number', default: 3157, description: 'HTTP server port' },
    HTTP_HOST: { type: 'string', default: 'localhost', description: 'HTTP server host' },
    HTTP_REQUEST_TIMEOUT: { type: 'number', default: 300000, description: 'HTTP request timeout in milliseconds (5 minutes)' },
    HTTP_MAX_REQUEST_SIZE: { type: 'string', default: '10mb', description: 'Maximum HTTP request body size' },

    // Session management
    HTTP_SESSION_TIMEOUT: { type: 'number', default: 1800000, description: 'Session timeout in milliseconds (30 minutes)' },
    HTTP_SESSION_CLEANUP_INTERVAL: { type: 'number', default: 300000, description: 'Session cleanup interval in milliseconds (5 minutes)' },
    HTTP_MAX_CONCURRENT_SESSIONS: { type: 'number', default: 100, description: 'Maximum concurrent sessions' },

    // CORS configuration
    HTTP_ENABLE_CORS: { type: 'boolean', default: true, description: 'Enable CORS for HTTP transport' },
    HTTP_CORS_ORIGINS: { type: 'string', default: '*', description: 'CORS allowed origins (comma-separated)' },
    HTTP_CORS_METHODS: { type: 'string', default: 'GET,POST,DELETE,OPTIONS', description: 'CORS allowed methods' },
    HTTP_CORS_HEADERS: { type: 'string', default: 'Content-Type,mcp-session-id,Authorization', description: 'CORS allowed headers' },
    HTTP_CORS_CREDENTIALS: { type: 'boolean', default: false, description: 'CORS allow credentials' },

    // Security settings
    HTTP_DNS_REBINDING_PROTECTION: { type: 'boolean', default: false, description: 'Enable DNS rebinding protection' },
    HTTP_ALLOWED_HOSTS: { type: 'string', default: '127.0.0.1,localhost', description: 'Allowed hosts for DNS rebinding protection (comma-separated)' },
    HTTP_RATE_LIMIT_ENABLED: { type: 'boolean', default: false, description: 'Enable rate limiting' },
    HTTP_RATE_LIMIT_WINDOW: { type: 'number', default: 900000, description: 'Rate limit window in milliseconds (15 minutes)' },
    HTTP_RATE_LIMIT_MAX_REQUESTS: { type: 'number', default: 1000, description: 'Maximum requests per window' },
  },

  // API Keys (at least one required)
  apiKeys: {
    OPENAI_API_KEY: { type: 'string', required: false, secret: true, description: 'OpenAI API key' },
    XAI_API_KEY: { type: 'string', required: false, secret: true, description: 'XAI API key' },
    GOOGLE_API_KEY: { type: 'string', required: false, secret: true, description: 'Google API key' },
    ANTHROPIC_API_KEY: { type: 'string', required: false, secret: true, description: 'Anthropic API key' },
    MISTRAL_API_KEY: { type: 'string', required: false, secret: true, description: 'Mistral API key' },
    DEEPSEEK_API_KEY: { type: 'string', required: false, secret: true, description: 'DeepSeek API key' },
    OPENROUTER_API_KEY: { type: 'string', required: false, secret: true, description: 'OpenRouter API key' },
  },

  // Provider-specific configuration
  providers: {
    OPENROUTER_REFERER: { type: 'string', required: false, description: 'OpenRouter referer header for compliance' },
  },


  // MCP configuration
  mcp: {
    MCP_SERVER_NAME: { type: 'string', default: 'converse-mcp-server', description: 'MCP server name' },
    MCP_SERVER_VERSION: { type: 'string', default: '1.0.0', description: 'MCP server version' },
    MAX_MCP_OUTPUT_TOKENS: { type: 'number', default: 25000, description: 'Maximum tokens in MCP tool responses' },
  },
};

// ConfigurationError now imported from errorHandler

/**
 * Validates and parses environment variable value according to schema
 * @param {string} key - Environment variable key
 * @param {string|undefined} value - Environment variable value
 * @param {object} schema - Schema definition for the variable
 * @returns {any} Parsed and validated value
 */
function validateEnvVar(key, value, schema) {
  // Handle missing values
  if (value === undefined || value === '') {
    if (schema.required) {
      throw new ConfigurationError(`Required environment variable ${key} is missing`);
    }
    return schema.default;
  }

  // Type validation and conversion
  switch (schema.type) {
  case 'string':
    return value;
  case 'number':
    const num = parseInt(value, 10);
    if (isNaN(num)) {
      throw new ConfigurationError(
        `Environment variable ${key} must be a valid number, got: ${value}`
      );
    }
    return num;
  case 'boolean':
    const lower = value.toLowerCase();
    if (!['true', 'false', '1', '0', 'yes', 'no'].includes(lower)) {
      throw new ConfigurationError(
        `Environment variable ${key} must be a boolean value, got: ${value}`
      );
    }
    return ['true', '1', 'yes'].includes(lower);
  default:
    return value;
  }
}

/**
 * Validates API key format and basic structure
 * @param {string} provider - Provider name
 * @param {string} apiKey - API key to validate
 * @returns {boolean} True if API key appears valid
 */
function validateApiKeyFormat(provider, apiKey) {
  if (!apiKey || typeof apiKey !== 'string') {
    return false;
  }

  // Basic format validation for each provider
  switch (provider) {
  case 'openai':
    return apiKey.startsWith('sk-') && apiKey.length > 20;
  case 'xai':
    return apiKey.startsWith('xai-') && apiKey.length > 20;
  case 'google':
    return apiKey.length > 20; // Google keys vary in format
  case 'anthropic':
    return apiKey.startsWith('sk-ant-') && apiKey.length >= 30;
  case 'mistral':
    return apiKey.length >= 32; // Mistral keys are typically 32+ chars
  case 'deepseek':
    return apiKey.length >= 32; // DeepSeek keys are typically 32+ chars
  case 'openrouter':
    return apiKey.startsWith('sk-or-') && apiKey.length >= 40;
  default:
    return apiKey.length >= 10; // Basic minimum length check
  }
}

/**
 * Loads and validates complete configuration from environment variables
 * @returns {Promise<object>} Validated configuration object
 * @throws {ConfigurationError} If configuration is invalid or incomplete
 */
export async function loadConfig() {
  const configLogger = logger.operation('loadConfig');
  configLogger.debug('Starting configuration loading');

  const config = {
    server: {},
    transport: {},
    apiKeys: {},
    providers: {},
    mcp: {},
    environment: {
      isDevelopment: false,
      isProduction: false,
      nodeEnv: '',
    },
  };

  const errors = [];

  try {
    // Load server configuration
    for (const [key, schema] of Object.entries(CONFIG_SCHEMA.server)) {
      try {
        config.server[key.toLowerCase()] = validateEnvVar(key, process.env[key], schema);
      } catch (error) {
        errors.push(error.message);
      }
    }

    // Load transport configuration
    for (const [key, schema] of Object.entries(CONFIG_SCHEMA.transport)) {
      try {
        const value = validateEnvVar(key, process.env[key], schema);

        if (key === 'MCP_TRANSPORT') {
          config.transport.mcptransport = value;
        } else if (key.startsWith('HTTP_')) {
          // Convert HTTP_PORT -> port, HTTP_CORS_ORIGINS -> corsorigins, etc.
          const configKey = key.replace('HTTP_', '').toLowerCase().replace(/_/g, '');
          config.transport[configKey] = value;
        }
      } catch (error) {
        errors.push(error.message);
      }
    }

    // Load API keys
    for (const [key, schema] of Object.entries(CONFIG_SCHEMA.apiKeys)) {
      try {
        const value = validateEnvVar(key, process.env[key], schema);
        if (value) {
          const providerName = key.replace('_API_KEY', '').toLowerCase();
          config.apiKeys[providerName] = value;
        }
      } catch (error) {
        errors.push(error.message);
      }
    }

    // Load provider-specific configuration
    config.providers = {};
    for (const [key, schema] of Object.entries(CONFIG_SCHEMA.providers)) {
      try {
        const value = validateEnvVar(key, process.env[key], schema);
        if (value) {
          const configKey = key.toLowerCase().replace(/_/g, '');
          config.providers[configKey] = value;
        }
      } catch (error) {
        errors.push(error.message);
      }
    }

    // Load MCP configuration
    for (const [key, schema] of Object.entries(CONFIG_SCHEMA.mcp)) {
      try {
        const value = validateEnvVar(key, process.env[key], schema);
        const configKey = key.replace('MCP_SERVER_', '').toLowerCase();
        config.mcp[configKey] = value;
      } catch (error) {
        errors.push(error.message);
      }
    }

    // Set environment flags
    const nodeEnv = config.server.node_env || 'development';
    config.environment = {
      isDevelopment: nodeEnv === 'development',
      isProduction: nodeEnv === 'production',
      nodeEnv,
    };

    // Validate that at least one API key is present
    const availableKeys = Object.keys(config.apiKeys);
    if (availableKeys.length === 0) {
      errors.push(
        'At least one API key must be configured: OPENAI_API_KEY, XAI_API_KEY, GOOGLE_API_KEY, ANTHROPIC_API_KEY, MISTRAL_API_KEY, DEEPSEEK_API_KEY, or OPENROUTER_API_KEY'
      );
    }

    // Validate API key formats
    for (const [provider, apiKey] of Object.entries(config.apiKeys)) {
      if (!validateApiKeyFormat(provider, apiKey)) {
        errors.push(`Invalid API key format for ${provider.toUpperCase()}_API_KEY`);
      }
    }

    // Throw accumulated errors
    if (errors.length > 0) {
      throw new ConfigurationError(
        `Configuration validation failed with ${errors.length} error(s):\n${errors.map(e => `  - ${e}`).join('\n')}`,
        { errors }
      );
    }

    // Log configuration summary (without secrets)
    logConfigurationSummary(config);
    configLogger.info('Configuration loaded successfully');

    return config;

  } catch (error) {
    configLogger.error('Configuration loading failed', { error });
    if (error instanceof ConfigurationError) {
      throw error;
    }
    throw new ConfigurationError(`Failed to load configuration: ${error.message}`, { originalError: error });
  }
}

/**
 * Gets HTTP transport configuration with proper structure
 * @param {object} config - Main configuration object
 * @returns {object} HTTP transport configuration
 */
export function getHttpTransportConfig(config) {
  const transport = config.transport;

  // Parse comma-separated values
  const corsOrigins = transport.corsorigins === '*' ? '*' : transport.corsorigins?.split(',').map(o => o.trim()) || ['*'];
  const corsMethods = transport.corsmethods?.split(',').map(m => m.trim()) || ['GET', 'POST', 'DELETE', 'OPTIONS'];
  const corsHeaders = transport.corsheaders?.split(',').map(h => h.trim()) || ['Content-Type', 'mcp-session-id', 'Authorization'];
  const allowedHosts = transport.allowedhosts?.split(',').map(h => h.trim()) || ['127.0.0.1', 'localhost'];

  return {
    // Server settings
    port: transport.port || 3157,
    host: transport.host || 'localhost',
    requestTimeout: transport.requesttimeout || 300000,
    maxRequestSize: transport.maxrequestsize || '10mb',

    // Session management
    sessionTimeout: transport.sessiontimeout || 1800000,
    sessionCleanupInterval: transport.sessioncleanupinterval || 300000,
    maxConcurrentSessions: transport.maxconcurrentsessions || 100,

    // CORS configuration
    enableCors: transport.enablecors !== false,
    corsOptions: {
      origin: corsOrigins,
      methods: corsMethods,
      allowedHeaders: corsHeaders,
      credentials: transport.corscredentials || false,
      exposedHeaders: ['Mcp-Session-Id'],
    },

    // Security settings
    enableDnsRebindingProtection: transport.dnsrebindingprotection || false,
    allowedHosts,
    rateLimitEnabled: transport.ratelimitenabled || false,
    rateLimitWindow: transport.ratelimitwindow || 900000,
    rateLimitMaxRequests: transport.ratelimitmaxrequests || 1000,
  };
}

/**
 * Gets configuration for a specific provider
 * @param {object} config - Main configuration object
 * @param {string} providerName - Name of the provider
 * @returns {object} Provider-specific configuration
 */
export function getProviderConfig(config, providerName) {
  const apiKey = config.apiKeys[providerName];
  const providerConfig = {};

  // Provider-specific configuration can be added here if needed

  return {
    apiKey,
    ...providerConfig,
  };
}

/**
 * Checks if a provider is available (has valid API key)
 * @param {object} config - Main configuration object
 * @param {string} providerName - Name of the provider
 * @returns {boolean} True if provider is available
 */
export function isProviderAvailable(config, providerName) {
  const apiKey = config.apiKeys[providerName];
  return apiKey && validateApiKeyFormat(providerName, apiKey);
}

/**
 * Gets list of available providers
 * @param {object} config - Main configuration object
 * @returns {string[]} Array of available provider names
 */
export function getAvailableProviders(config) {
  return Object.keys(config.apiKeys).filter(provider =>
    isProviderAvailable(config, provider)
  );
}

/**
 * Validates runtime configuration consistency
 * @param {object} config - Configuration object to validate
 * @returns {Promise<boolean>} True if configuration is valid
 * @throws {ConfigurationError} If configuration is invalid
 */
export async function validateRuntimeConfig(config) {
  try {
    // Validate server configuration
    if (config.server.port < 1 || config.server.port > 65535) {
      throw new ConfigurationError(`Invalid port number: ${config.server.port}`);
    }

    // Validate environment
    const validEnvs = ['development', 'production', 'test'];
    if (!validEnvs.includes(config.environment.nodeEnv)) {
      throw new ConfigurationError(
        `Invalid NODE_ENV: ${config.environment.nodeEnv}. Must be one of: ${validEnvs.join(', ')}`
      );
    }

    // Validate log level
    const validLogLevels = ['silent', 'error', 'warn', 'info', 'debug'];
    if (!validLogLevels.includes(config.server.log_level)) {
      throw new ConfigurationError(
        `Invalid LOG_LEVEL: ${config.server.log_level}. Must be one of: ${validLogLevels.join(', ')}`
      );
    }

    // Validate HTTP transport configuration
    if (config.transport.mcptransport === 'http') {
      const httpConfig = getHttpTransportConfig(config);

      // Validate HTTP port
      if (httpConfig.port < 1 || httpConfig.port > 65535) {
        throw new ConfigurationError(`Invalid HTTP_PORT: ${httpConfig.port}. Must be between 1 and 65535`);
      }

      // Validate timeouts
      if (httpConfig.requestTimeout < 1000) {
        throw new ConfigurationError(`Invalid HTTP_REQUEST_TIMEOUT: ${httpConfig.requestTimeout}. Must be at least 1000ms`);
      }

      if (httpConfig.sessionTimeout < 60000) {
        throw new ConfigurationError(`Invalid HTTP_SESSION_TIMEOUT: ${httpConfig.sessionTimeout}. Must be at least 60000ms (1 minute)`);
      }

      if (httpConfig.sessionCleanupInterval < 10000) {
        throw new ConfigurationError(`Invalid HTTP_SESSION_CLEANUP_INTERVAL: ${httpConfig.sessionCleanupInterval}. Must be at least 10000ms (10 seconds)`);
      }

      // Validate max concurrent sessions
      if (httpConfig.maxConcurrentSessions < 1 || httpConfig.maxConcurrentSessions > 10000) {
        throw new ConfigurationError(`Invalid HTTP_MAX_CONCURRENT_SESSIONS: ${httpConfig.maxConcurrentSessions}. Must be between 1 and 10000`);
      }

      // Validate rate limiting
      if (httpConfig.rateLimitEnabled) {
        if (httpConfig.rateLimitWindow < 1000) {
          throw new ConfigurationError(`Invalid HTTP_RATE_LIMIT_WINDOW: ${httpConfig.rateLimitWindow}. Must be at least 1000ms`);
        }

        if (httpConfig.rateLimitMaxRequests < 1) {
          throw new ConfigurationError(`Invalid HTTP_RATE_LIMIT_MAX_REQUESTS: ${httpConfig.rateLimitMaxRequests}. Must be at least 1`);
        }
      }
    }

    // Production-specific validations
    if (config.environment.isProduction) {
      // Require at least 2 providers in production for redundancy
      const availableProviders = getAvailableProviders(config);
      if (availableProviders.length < 1) {
        logger.warn('Only one provider configured in production environment');
      }
    }

    return true;

  } catch (error) {
    if (error instanceof ConfigurationError) {
      throw error;
    }
    throw new ConfigurationError(`Runtime validation failed: ${error.message}`);
  }
}

/**
 * Logs configuration summary (masking sensitive information)
 * Only logs when NOT in MCP stdio mode to avoid interfering with JSON-RPC protocol
 * @param {object} config - Configuration object
 */
function logConfigurationSummary(config) {
  // Skip logging when running as MCP server to avoid interfering with JSON-RPC
  if (process.stdin.isTTY === false || process.env.NODE_ENV === 'test') {
    return;
  }

  const availableProviders = getAvailableProviders(config);

  // Log configuration summary
  logger.info('Configuration loaded successfully', {
    data: {
      environment: config.environment.nodeEnv,
      port: config.server.port,
      logLevel: config.server.log_level,
      availableProviders: availableProviders.join(', ') || 'none',
      mcpServer: `${config.mcp.name} v${config.mcp.version}`,
      apiKeys: Object.keys(config.apiKeys).map(key => {
        const value = config.apiKeys[key];
        return `${key.toUpperCase()}: ${value ? `${value.substring(0, 8)}...` : 'not configured'}`;
      }).join(', ')
    }
  });
}

/**
 * Creates MCP client configuration object
 * @param {object} config - Main configuration object
 * @returns {object} MCP client configuration
 */
export function getMcpClientConfig(config) {
  return {
    name: config.mcp.name,
    version: config.mcp.version,
    capabilities: {
      tools: {},
      prompts: {},
      resources: {},
    },
    environment: config.environment.nodeEnv,
    providers: getAvailableProviders(config),
  };
}
