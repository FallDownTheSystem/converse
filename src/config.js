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
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { readFileSync } from 'fs';
import { findAgyBinary } from './providers/gemini-cli.js';

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
  isDevelopment: process.env.NODE_ENV === 'development',
});

const logger = createLogger('config');

/**
 * Configuration schema defining all supported environment variables
 */
const CONFIG_SCHEMA = {
  // Server configuration
  server: {
    NODE_ENV: {
      type: 'string',
      default: 'development',
      description: 'Environment mode',
    },
    LOG_LEVEL: {
      type: 'string',
      default: 'info',
      description: 'Logging level',
    },
    CLIENT_CWD: {
      type: 'string',
      default: null,
      description: 'Client working directory for relative paths',
    },
  },

  // Transport configuration
  transport: {
    MCP_TRANSPORT: {
      type: 'string',
      default: 'stdio',
      description: 'MCP transport type (stdio or http)',
    },

    // HTTP server settings
    HTTP_PORT: {
      type: 'number',
      default: 3157,
      description: 'HTTP server port',
    },
    HTTP_HOST: {
      type: 'string',
      default: 'localhost',
      description: 'HTTP server host',
    },
    HTTP_REQUEST_TIMEOUT: {
      type: 'number',
      default: 300000,
      description: 'HTTP request timeout in milliseconds (5 minutes)',
    },
    HTTP_MAX_REQUEST_SIZE: {
      type: 'string',
      default: '10mb',
      description: 'Maximum HTTP request body size',
    },

    // Session management
    HTTP_SESSION_TIMEOUT: {
      type: 'number',
      default: 1800000,
      description: 'Session timeout in milliseconds (30 minutes)',
    },
    HTTP_SESSION_CLEANUP_INTERVAL: {
      type: 'number',
      default: 300000,
      description: 'Session cleanup interval in milliseconds (5 minutes)',
    },
    HTTP_MAX_CONCURRENT_SESSIONS: {
      type: 'number',
      default: 100,
      description: 'Maximum concurrent sessions',
    },

    // CORS configuration
    HTTP_ENABLE_CORS: {
      type: 'boolean',
      default: true,
      description: 'Enable CORS for HTTP transport',
    },
    HTTP_CORS_ORIGINS: {
      type: 'string',
      default: '*',
      description: 'CORS allowed origins (comma-separated)',
    },
    HTTP_CORS_METHODS: {
      type: 'string',
      default: 'GET,POST,DELETE,OPTIONS',
      description: 'CORS allowed methods',
    },
    HTTP_CORS_HEADERS: {
      type: 'string',
      default: 'Content-Type,mcp-session-id,Authorization',
      description: 'CORS allowed headers',
    },
    HTTP_CORS_CREDENTIALS: {
      type: 'boolean',
      default: false,
      description: 'CORS allow credentials',
    },

    // Security settings
    HTTP_DNS_REBINDING_PROTECTION: {
      type: 'boolean',
      default: false,
      description: 'Enable DNS rebinding protection',
    },
    HTTP_ALLOWED_HOSTS: {
      type: 'string',
      default: '127.0.0.1,localhost',
      description:
        'Allowed hosts for DNS rebinding protection (comma-separated)',
    },
    HTTP_RATE_LIMIT_ENABLED: {
      type: 'boolean',
      default: false,
      description: 'Enable rate limiting',
    },
    HTTP_RATE_LIMIT_WINDOW: {
      type: 'number',
      default: 900000,
      description: 'Rate limit window in milliseconds (15 minutes)',
    },
    HTTP_RATE_LIMIT_MAX_REQUESTS: {
      type: 'number',
      default: 1000,
      description: 'Maximum requests per window',
    },
  },

  // API Keys (at least one required)
  apiKeys: {
    OPENAI_API_KEY: {
      type: 'string',
      required: false,
      secret: true,
      description: 'OpenAI API key',
    },
    XAI_API_KEY: {
      type: 'string',
      required: false,
      secret: true,
      description: 'XAI API key',
    },
    GOOGLE_API_KEY: {
      type: 'string',
      required: false,
      secret: true,
      description: 'Google API key',
    },
    GEMINI_API_KEY: {
      type: 'string',
      required: false,
      secret: true,
      description: 'Gemini API key (alternative to GOOGLE_API_KEY)',
    },
    ANTHROPIC_API_KEY: {
      type: 'string',
      required: false,
      secret: true,
      description: 'Anthropic API key',
    },
    MISTRAL_API_KEY: {
      type: 'string',
      required: false,
      secret: true,
      description: 'Mistral API key',
    },
    DEEPSEEK_API_KEY: {
      type: 'string',
      required: false,
      secret: true,
      description: 'DeepSeek API key',
    },
    OPENROUTER_API_KEY: {
      type: 'string',
      required: false,
      secret: true,
      description: 'OpenRouter API key',
    },
  },

  // Provider-specific configuration
  providers: {
    OPENROUTER_REFERER: {
      type: 'string',
      required: false,
      description: 'OpenRouter referer header for compliance',
    },
    OPENROUTER_TITLE: {
      type: 'string',
      required: false,
      description: 'OpenRouter X-Title header for request tracking',
    },
    OPENROUTER_DYNAMIC_MODELS: {
      type: 'boolean',
      default: false,
      description:
        'Enable dynamic model discovery via OpenRouter endpoints API',
    },

    // Google Vertex AI configuration
    GOOGLE_GENAI_USE_VERTEXAI: {
      type: 'boolean',
      default: false,
      description: 'Use Google Vertex AI instead of Gemini Developer API',
    },
    GOOGLE_CLOUD_PROJECT: {
      type: 'string',
      required: false,
      description: 'Google Cloud project ID for Vertex AI',
    },
    GOOGLE_CLOUD_LOCATION: {
      type: 'string',
      required: false,
      description: 'Google Cloud location for Vertex AI (e.g., us-central1)',
    },
    GOOGLE_API_VERSION: {
      type: 'string',
      default: 'v1beta',
      description: 'Google API version (v1, v1beta, v1alpha)',
    },

    // Codex configuration
    CODEX_API_KEY: {
      type: 'string',
      required: false,
      secret: true,
      description: 'Codex API key (alternative to ChatGPT login)',
    },
    CODEX_SANDBOX_MODE: {
      type: 'string',
      default: 'read-only',
      description:
        'Codex sandbox mode (read-only | workspace-write | danger-full-access)',
    },
    CODEX_SKIP_GIT_CHECK: {
      type: 'boolean',
      default: true,
      description: 'Skip Git repository validation check',
    },
    CODEX_APPROVAL_POLICY: {
      type: 'string',
      default: 'never',
      description:
        'Approval policy (never | untrusted | on-failure | on-request)',
    },
    CODEX_MODEL: {
      type: 'string',
      default: 'gpt-5.5',
      description:
        'Default Codex model (e.g., gpt-5.5, gpt-5.3-codex, gpt-5-codex)',
    },

    // Copilot configuration
    COPILOT_TOOL_ACCESS: {
      type: 'string',
      default: 'read-only',
      description: 'Copilot tool access level (read-only | full)',
    },
    COPILOT_MODEL: {
      type: 'string',
      required: false,
      description:
        'Default model for Copilot SDK sessions (e.g., gpt-5, claude-sonnet-4.5)',
    },
    COPILOT_CLI_PATH: {
      type: 'string',
      required: false,
      description:
        'Explicit path to the Copilot CLI runtime (index.js or copilot binary). Overrides automatic resolution.',
    },
  },

  // MCP configuration
  mcp: {
    MAX_MCP_OUTPUT_TOKENS: {
      type: 'number',
      default: 25000,
      description: 'Maximum tokens in MCP tool responses',
    },
  },

  // Summarization configuration
  summarization: {
    ENABLE_RESPONSE_SUMMARIZATION: {
      type: 'boolean',
      default: false,
      description:
        'Enable AI-powered response summarization for async operations',
    },
    SUMMARIZATION_MODEL: {
      type: 'string',
      default: 'gpt-5-nano',
      description:
        'Model to use for summarization tasks (title generation, streaming summaries, final summaries)',
    },
  },

  // Async tools configuration
  async: {
    DISABLE_ASYNC_TOOLS: {
      type: 'boolean',
      default: false,
      description:
        'Disable async execution support (removes async parameter from tools and status check tools)',
    },
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
      throw new ConfigurationError(
        `Required environment variable ${key} is missing`,
      );
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
        `Environment variable ${key} must be a valid number, got: ${value}`,
      );
    }
    return num;
  case 'boolean':
    const lower = value.toLowerCase();
    if (!['true', 'false', '1', '0', 'yes', 'no'].includes(lower)) {
      throw new ConfigurationError(
        `Environment variable ${key} must be a boolean value, got: ${value}`,
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
  case 'gemini':
    // Special case for Vertex AI marker
    if (apiKey === 'VERTEX_AI') return true;
    return apiKey.length > 20; // Google/Gemini keys vary in format
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
 * Normalize Git Bash paths to Windows paths on Windows.
 * Converts /c/Users/... to C:\Users\... so path.resolve() works correctly.
 * On non-Windows platforms, returns the path unchanged.
 */
function normalizeGitBashPath(inputPath) {
  if (
    process.platform === 'win32' &&
    /^\/[a-zA-Z]\//.test(inputPath)
  ) {
    return resolve(
      inputPath[1].toUpperCase() + ':' + inputPath.slice(2).replace(/\//g, '\\'),
    );
  }
  return inputPath;
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
    summarization: {},
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
        // Special handling for CLIENT_CWD - auto-detect if not explicitly set
        if (key === 'CLIENT_CWD') {
          const explicitCwd = process.env[key];
          const detectedCwd = explicitCwd ||
            process.env.INIT_CWD ||
            process.env.PWD ||
            process.env.npm_config_local_prefix ||
            process.cwd();
          // Normalize Git Bash paths (/c/Users/... -> C:\Users\...)
          config.server.client_cwd = normalizeGitBashPath(detectedCwd);
          configLogger.debug(
            `Client working directory: ${config.server.client_cwd}${explicitCwd ? ' (from CLIENT_CWD)' : ' (auto-detected)'}`,
          );
        } else {
          config.server[key.toLowerCase()] = validateEnvVar(
            key,
            process.env[key],
            schema,
          );
        }
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
          const configKey = key
            .replace('HTTP_', '')
            .toLowerCase()
            .replace(/_/g, '');
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
          // Map GEMINI_API_KEY to google provider
          if (providerName === 'gemini') {
            // Only use GEMINI_API_KEY if GOOGLE_API_KEY is not already set
            if (!config.apiKeys.google) {
              config.apiKeys.google = value;
            }
          } else {
            config.apiKeys[providerName] = value;
          }
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
        // CRITICAL: Use !== undefined to preserve boolean false values
        // Without this, CODEX_SKIP_GIT_CHECK=false would be dropped
        if (value !== undefined) {
          const configKey = key.toLowerCase().replace(/_/g, '');
          config.providers[configKey] = value;

          // Validate Codex sandbox mode during loading
          if (key === 'CODEX_SANDBOX_MODE') {
            const validSandboxModes = [
              'read-only',
              'workspace-write',
              'danger-full-access',
            ];
            if (!validSandboxModes.includes(value)) {
              errors.push(
                `Invalid CODEX_SANDBOX_MODE: "${value}". Must be one of: ${validSandboxModes.join(', ')}`,
              );
            }
          }

          // Validate Codex approval policy during loading
          if (key === 'CODEX_APPROVAL_POLICY') {
            const validPolicies = [
              'never',
              'untrusted',
              'on-failure',
              'on-request',
            ];
            if (!validPolicies.includes(value)) {
              errors.push(
                `Invalid CODEX_APPROVAL_POLICY: "${value}". Must be one of: ${validPolicies.join(', ')}`,
              );
            }
          }

          // Validate Copilot tool access level during loading
          if (key === 'COPILOT_TOOL_ACCESS') {
            const validAccessLevels = ['read-only', 'full'];
            if (!validAccessLevels.includes(value)) {
              errors.push(
                `Invalid COPILOT_TOOL_ACCESS: "${value}". Must be one of: ${validAccessLevels.join(', ')}`,
              );
            }
          }
        }
      } catch (error) {
        errors.push(error.message);
      }
    }

    // Load MCP configuration
    for (const [key, schema] of Object.entries(CONFIG_SCHEMA.mcp)) {
      try {
        const value = validateEnvVar(key, process.env[key], schema);
        const configKey = key
          .replace('MAX_MCP_OUTPUT_TOKENS', 'max_mcp_output_tokens')
          .toLowerCase();
        config.mcp[configKey] = value;
      } catch (error) {
        errors.push(error.message);
      }
    }

    // Load Summarization configuration
    for (const [key, schema] of Object.entries(CONFIG_SCHEMA.summarization)) {
      try {
        const value = validateEnvVar(key, process.env[key], schema);
        if (key === 'ENABLE_RESPONSE_SUMMARIZATION') {
          config.summarization.enabled = value;
        } else if (key === 'SUMMARIZATION_MODEL') {
          config.summarization.model = value;
        }
      } catch (error) {
        errors.push(error.message);
      }
    }

    // Load Async tools configuration
    config.async = {};
    for (const [key, schema] of Object.entries(CONFIG_SCHEMA.async)) {
      try {
        const value = validateEnvVar(key, process.env[key], schema);
        if (key === 'DISABLE_ASYNC_TOOLS') {
          config.async.disableAsyncTools = value;
        }
      } catch (error) {
        errors.push(error.message);
      }
    }

    // Load name and version from package.json
    try {
      const packagePath = join(
        dirname(fileURLToPath(import.meta.url)),
        '../package.json',
      );
      const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
      config.mcp.name = packageJson.name || 'converse-mcp-server';
      config.mcp.version = packageJson.version || 'unknown';
    } catch (error) {
      // Fallback values if package.json can't be read
      config.mcp.name = 'converse-mcp-server';
      config.mcp.version = 'unknown';
      configLogger.warn('Could not read package.json for name/version', {
        error: error.message,
      });
    }

    // Set environment flags
    const nodeEnv = config.server.node_env || 'development';
    config.environment = {
      isDevelopment: nodeEnv === 'development',
      isProduction: nodeEnv === 'production',
      nodeEnv,
    };

    // Validate that at least one usable provider is available
    // API-key providers require keys; SDK-based providers (codex, claude, gemini-cli, copilot)
    // work via subscription auth — check if their packages are actually installed
    const availableKeys = Object.keys(config.apiKeys);
    const hasVertexAI =
      config.providers.googlegenaiusevertexai &&
      config.providers.googlecloudproject &&
      config.providers.googlecloudlocation;
    const sdkPackages = {
      codex: '@openai/codex-sdk',
      claude: '@anthropic-ai/claude-agent-sdk',
      copilot: '@github/copilot-sdk',
    };
    let hasSdkProvider = Object.values(sdkPackages).some((pkg) => {
      try {
        import.meta.resolve(pkg);
        return true;
      } catch {
        return false;
      }
    });

    // gemini-cli availability comes from the Antigravity CLI binary, not an
    // npm package — reuse the provider's probe (safe to import: node-pty is
    // lazy-loaded at invoke time). Only probed when validation would otherwise
    // fail, since hasSdkProvider is only read by the check below.
    if (
      availableKeys.length === 0 &&
      !hasVertexAI &&
      !hasSdkProvider &&
      findAgyBinary() !== null
    ) {
      hasSdkProvider = true;
    }

    if (availableKeys.length === 0 && !hasVertexAI && !hasSdkProvider) {
      errors.push(
        'At least one API key must be configured: OPENAI_API_KEY, XAI_API_KEY, GOOGLE_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY, MISTRAL_API_KEY, DEEPSEEK_API_KEY, or OPENROUTER_API_KEY. Alternatively, configure Google Vertex AI or use an SDK-based provider (codex, claude, copilot) or the Antigravity CLI (gemini-cli).',
      );
    }

    // If Vertex AI is enabled, add it as a special google provider config
    if (hasVertexAI) {
      // Mark google as available even without API key when using Vertex AI
      if (!config.apiKeys.google) {
        config.apiKeys.google = 'VERTEX_AI'; // Special marker for Vertex AI mode
      }
    }

    // Validate API key formats
    for (const [provider, apiKey] of Object.entries(config.apiKeys)) {
      if (!validateApiKeyFormat(provider, apiKey)) {
        errors.push(
          `Invalid API key format for ${provider.toUpperCase()}_API_KEY`,
        );
      }
    }

    // Throw accumulated errors
    if (errors.length > 0) {
      throw new ConfigurationError(
        `Configuration validation failed with ${errors.length} error(s):\n${errors.map((e) => `  - ${e}`).join('\n')}`,
        { errors },
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
    throw new ConfigurationError(
      `Failed to load configuration: ${error.message}`,
      { originalError: error },
    );
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
  const corsOrigins =
    transport.corsorigins === '*'
      ? '*'
      : transport.corsorigins?.split(',').map((o) => o.trim()) || ['*'];
  const corsMethods = transport.corsmethods
    ?.split(',')
    .map((m) => m.trim()) || ['GET', 'POST', 'DELETE', 'OPTIONS'];
  const corsHeaders = transport.corsheaders
    ?.split(',')
    .map((h) => h.trim()) || [
    'Content-Type',
    'mcp-session-id',
    'Authorization',
  ];
  const allowedHosts = transport.allowedhosts
    ?.split(',')
    .map((h) => h.trim()) || ['127.0.0.1', 'localhost'];

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
  return Object.keys(config.apiKeys).filter((provider) =>
    isProviderAvailable(config, provider),
  );
}

/**
 * Validates Codex-specific configuration
 * @param {object} config - Configuration object to validate
 * @throws {ConfigurationError} If Codex configuration is invalid
 */
function validateCodexConfig(config) {
  const sandbox = config.providers?.codexsandboxmode;
  const approvalPolicy = config.providers?.codexapprovalpolicy;

  // Validate sandbox mode
  const validSandboxModes = [
    'read-only',
    'workspace-write',
    'danger-full-access',
  ];
  if (sandbox && !validSandboxModes.includes(sandbox)) {
    throw new ConfigurationError(
      `Invalid CODEX_SANDBOX_MODE: "${sandbox}". Must be one of: ${validSandboxModes.join(', ')}`,
    );
  }

  // Validate approval policy
  const validPolicies = ['never', 'untrusted', 'on-failure', 'on-request'];
  if (approvalPolicy && !validPolicies.includes(approvalPolicy)) {
    throw new ConfigurationError(
      `Invalid CODEX_APPROVAL_POLICY: "${approvalPolicy}". Must be one of: ${validPolicies.join(', ')}`,
    );
  }

  // Warn about dangerous configurations
  if (sandbox === 'danger-full-access') {
    logger.warn(
      '[Codex] Warning: Running with danger-full-access sandbox mode - full filesystem access enabled',
    );
  }

  if (
    (approvalPolicy === 'on-request' || approvalPolicy === 'untrusted') &&
    config.transport.mcptransport !== 'stdio'
  ) {
    logger.warn(
      `[Codex] Warning: approval policy '${approvalPolicy}' may cause hangs in headless/server mode`,
    );
  }
}

/**
 * Validates runtime configuration consistency
 * @param {object} config - Configuration object to validate
 * @returns {Promise<boolean>} True if configuration is valid
 * @throws {ConfigurationError} If configuration is invalid
 */
export async function validateRuntimeConfig(config) {
  try {
    // Validate Codex configuration
    validateCodexConfig(config);

    // Validate environment
    const validEnvs = ['development', 'production', 'test'];
    if (!validEnvs.includes(config.environment.nodeEnv)) {
      throw new ConfigurationError(
        `Invalid NODE_ENV: ${config.environment.nodeEnv}. Must be one of: ${validEnvs.join(', ')}`,
      );
    }

    // Validate log level
    const validLogLevels = ['silent', 'error', 'warn', 'info', 'debug'];
    if (!validLogLevels.includes(config.server.log_level)) {
      throw new ConfigurationError(
        `Invalid LOG_LEVEL: ${config.server.log_level}. Must be one of: ${validLogLevels.join(', ')}`,
      );
    }

    // Validate HTTP transport configuration
    if (config.transport.mcptransport === 'http') {
      const httpConfig = getHttpTransportConfig(config);

      // Validate HTTP port
      if (httpConfig.port < 1 || httpConfig.port > 65535) {
        throw new ConfigurationError(
          `Invalid HTTP_PORT: ${httpConfig.port}. Must be between 1 and 65535`,
        );
      }

      // Validate timeouts
      if (httpConfig.requestTimeout < 1000) {
        throw new ConfigurationError(
          `Invalid HTTP_REQUEST_TIMEOUT: ${httpConfig.requestTimeout}. Must be at least 1000ms`,
        );
      }

      if (httpConfig.sessionTimeout < 60000) {
        throw new ConfigurationError(
          `Invalid HTTP_SESSION_TIMEOUT: ${httpConfig.sessionTimeout}. Must be at least 60000ms (1 minute)`,
        );
      }

      if (httpConfig.sessionCleanupInterval < 10000) {
        throw new ConfigurationError(
          `Invalid HTTP_SESSION_CLEANUP_INTERVAL: ${httpConfig.sessionCleanupInterval}. Must be at least 10000ms (10 seconds)`,
        );
      }

      // Validate max concurrent sessions
      if (
        httpConfig.maxConcurrentSessions < 1 ||
        httpConfig.maxConcurrentSessions > 10000
      ) {
        throw new ConfigurationError(
          `Invalid HTTP_MAX_CONCURRENT_SESSIONS: ${httpConfig.maxConcurrentSessions}. Must be between 1 and 10000`,
        );
      }

      // Validate rate limiting
      if (httpConfig.rateLimitEnabled) {
        if (httpConfig.rateLimitWindow < 1000) {
          throw new ConfigurationError(
            `Invalid HTTP_RATE_LIMIT_WINDOW: ${httpConfig.rateLimitWindow}. Must be at least 1000ms`,
          );
        }

        if (httpConfig.rateLimitMaxRequests < 1) {
          throw new ConfigurationError(
            `Invalid HTTP_RATE_LIMIT_MAX_REQUESTS: ${httpConfig.rateLimitMaxRequests}. Must be at least 1`,
          );
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
      transport: config.transport.mcptransport || 'stdio',
      logLevel: config.server.log_level,
      availableProviders: availableProviders.join(', ') || 'none',
      mcpServer: `${config.mcp.name} v${config.mcp.version}`,
      apiKeys: Object.keys(config.apiKeys)
        .map((key) => {
          const value = config.apiKeys[key];
          return `${key.toUpperCase()}: ${value ? `${value.substring(0, 8)}...` : 'not configured'}`;
        })
        .join(', '),
    },
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

// Export CONFIG_SCHEMA for use by help documentation generator
export { CONFIG_SCHEMA };
