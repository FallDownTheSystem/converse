/**
 * Central Request Router
 *
 * Single orchestration point that dispatches MCP requests to tools with dependency injection.
 * Handles tool lookup, error management, and consistent response formatting.
 * Follows functional architecture with comprehensive error handling.
 */

import { CallToolRequestSchema, ListToolsRequestSchema, ListPromptsRequestSchema, GetPromptRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { getContinuationStore } from './continuationStore.js';
import { getTools } from './tools/index.js';
import { getProviders } from './providers/index.js';
import { helpPromptHandler, helpPromptMetadata } from './prompts/helpPrompt.js';
import { helpResourceHandler, helpResourceMetadata, listResources } from './resources/helpResource.js';
import { processUnifiedContext } from './utils/contextProcessor.js';
import { getAsyncJobStore } from './async/asyncJobStore.js';
import { getJobRunner } from './async/jobRunner.js';
import { getFileCache } from './async/fileCache.js';
import providerStreamNormalizer from './async/providerStreamNormalizer.js';
import { createLogger, startTimer } from './utils/logger.js';
import { debugError } from './utils/console.js';
import {
  ConverseMCPError,
  ToolError,
  ValidationError,
  createMCPErrorResponse,
  withErrorHandler,
  ERROR_CODES
} from './utils/errorHandler.js';

const logger = createLogger('router');

/**
 * Router-specific error class
 */
export class RouterError extends ConverseMCPError {
  constructor(message, code = ERROR_CODES.ROUTER_ERROR, details = {}) {
    super(message, code, details, 500);
    this.name = 'RouterError';
  }
}

/**
 * Standard error response format for consistent error handling
 * @param {Error} error - The error that occurred
 * @param {string} toolName - Name of the tool that failed
 * @param {object} context - Additional context information
 * @returns {object} Standardized error response
 */
export function createErrorResponse(error, toolName = 'unknown', context = {}) {
  return createMCPErrorResponse(error, toolName, context);
}

/**
 * Validate tool exists and is callable
 * @param {string} toolName - Name of the tool to validate
 * @param {object} tools - Available tools registry
 * @returns {object} Validation result
 */
function validateTool(toolName, tools) {
  if (!toolName || typeof toolName !== 'string') {
    throw new RouterError(
      'Tool name must be a non-empty string',
      'INVALID_TOOL_NAME'
    );
  }

  if (!tools[toolName]) {
    const availableTools = Object.keys(tools);
    throw new RouterError(
      `Tool error: Unknown tool '${toolName}'. Available tools: ${availableTools.join(', ')}`,
      'UNKNOWN_TOOL',
      { requestedTool: toolName, availableTools }
    );
  }

  if (typeof tools[toolName] !== 'function') {
    throw new RouterError(
      `Tool ${toolName} is not callable`,
      'INVALID_TOOL_HANDLER',
      { toolName, toolType: typeof tools[toolName] }
    );
  }

  return {
    isValid: true,
    tool: tools[toolName]
  };
}

/**
 * Enhanced dependency injection with error handling
 * @param {object} config - Configuration object
 * @param {object} context - Additional context (e.g., session info)
 * @returns {object} Dependencies object for tool injection
 */
async function createDependencies(config, context = {}) {
  try {
    const continuationStore = getContinuationStore();
    const tools = getTools();
    const providers = getProviders();

    // Initialize async infrastructure
    const asyncJobStore = getAsyncJobStore();
    const fileCache = getFileCache(); // Initialize FileCache
    const jobRunner = getJobRunner({
      asyncJobStore,
      fileCache // Pass FileCache to JobRunner
    });

    // Validate that we have the necessary dependencies
    if (!continuationStore) {
      throw new RouterError(
        'Failed to initialize continuation store',
        'DEPENDENCY_ERROR'
      );
    }

    if (!tools || Object.keys(tools).length === 0) {
      throw new RouterError(
        'No tools available - tools registry is empty',
        'NO_TOOLS_AVAILABLE'
      );
    }

    if (!providers || Object.keys(providers).length === 0) {
      throw new RouterError(
        'No providers available - providers registry is empty',
        'NO_PROVIDERS_AVAILABLE'
      );
    }

    if (!asyncJobStore) {
      throw new RouterError(
        'Failed to initialize async job store',
        'DEPENDENCY_ERROR'
      );
    }

    if (!jobRunner) {
      throw new RouterError(
        'Failed to initialize job runner',
        'DEPENDENCY_ERROR'
      );
    }

    return {
      config,
      continuationStore,
      providers,
      contextProcessor: { processUnifiedContext },
      asyncJobStore,
      jobRunner,
      fileCache, // Include FileCache in dependencies
      providerStreamNormalizer,
      sessionId: 'local-user', // Always use local-user for single-user server
      router: {
        createErrorResponse,
        validateToolArguments,
      },
    };

  } catch (error) {
    debugError('Failed to create dependencies:', error);
    throw error;
  }
}

/**
 * Creates and configures the central router for handling MCP requests
 * @param {object} server - MCP Server instance
 * @param {object} config - Configuration object with provider settings
 * @returns {Promise<void>}
 */
export async function createRouter(server, config) {
  const createRouterLogger = logger.operation('createRouter');
  const timer = startTimer('router-initialization', 'router');

  try {
    createRouterLogger.info('Initializing router');

    // Initialize dependencies with validation
    const dependencies = await createDependencies(config);
    const tools = getTools();

    createRouterLogger.info(`Router initialized with ${Object.keys(tools).length} tools`);

    // Register unified tool call handler with enhanced error handling
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const toolTimer = startTimer('tool-execution', 'router');
      const toolName = request.params?.name;
      const toolArgs = request.params?.arguments || {};
      const requestLogger = logger.operation(`tool-call:${toolName}`);

      try {
        requestLogger.info('Tool execution started', {
          data: { toolName, argCount: Object.keys(toolArgs).length }
        });

        // Validate tool existence and callability
        const { tool } = validateTool(toolName, tools);

        // Validate tool arguments if schema is provided
        if (tool.inputSchema) {
          const isValidArgs = validateToolArguments(toolArgs, tool.inputSchema);
          if (!isValidArgs) {
            throw new ValidationError(
              `Invalid arguments for tool ${toolName}`,
              ERROR_CODES.INVALID_TOOL_ARGS,
              {
                providedArgs: Object.keys(toolArgs),
                expectedSchema: tool.inputSchema
              }
            );
          }
        }

        // Execute the tool with dependency injection
        const result = await tool(toolArgs, dependencies);

        const executionTime = toolTimer('completed');
        requestLogger.info('Tool execution completed', {
          data: { executionTime: `${executionTime}ms` }
        });

        // Ensure result has proper format
        if (!result || !result.content) {
          throw new ToolError(
            `Tool ${toolName} returned invalid result format`,
            ERROR_CODES.TOOL_EXECUTION_FAILED,
            { result },
            toolName
          );
        }

        return result;

      } catch (error) {
        const executionTime = toolTimer('failed');
        requestLogger.error('Tool execution failed', {
          error,
          data: { executionTime: `${executionTime}ms`, argCount: Object.keys(toolArgs).length }
        });

        return createErrorResponse(error, toolName, {
          executionTime,
          arguments: Object.keys(toolArgs),
          requestId: request.id || 'unknown'
        });
      }
    });

    // Register enhanced list_tools handler
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      try {
        const toolList = Object.entries(tools).map(([name, handler]) => {
          const toolInfo = {
            name,
            description: handler.description || `${name} tool - no description provided`,
            inputSchema: handler.inputSchema || {
              type: 'object',
              properties: {},
              description: 'No input schema defined'
            },
          };

          // Add additional metadata if available
          if (handler.version) {
            toolInfo.version = handler.version;
          }
          if (handler.category) {
            toolInfo.category = handler.category;
          }

          return toolInfo;
        });

        return {
          tools: toolList,
          metadata: {
            totalTools: toolList.length,
            timestamp: new Date().toISOString(),
            routerVersion: '1.0.0'
          }
        };

      } catch (error) {
        debugError('Error listing tools:', error);
        throw new RouterError(
          'Failed to list available tools',
          'TOOLS_LIST_ERROR',
          { error: error.message }
        );
      }
    });

    // Register list_prompts handler
    server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return {
        prompts: [helpPromptMetadata]
      };
    });

    // Register get_prompt handler
    server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const promptName = request.params?.name;

      if (promptName === 'help') {
        const promptArgs = request.params?.arguments || {};
        const result = await helpPromptHandler(promptArgs);

        return {
          description: helpPromptMetadata.description,
          ...result
        };
      }

      throw new RouterError(
        `Prompt '${promptName}' not found`,
        'PROMPT_NOT_FOUND',
        { requestedPrompt: promptName }
      );
    });

    // Register list_resources handler
    server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const resources = listResources();
      return {
        resources
      };
    });

    // Register read_resource handler
    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const resourceUri = request.params?.uri;

      if (resourceUri === helpResourceMetadata.uri) {
        return await helpResourceHandler();
      }

      throw new RouterError(
        `Resource '${resourceUri}' not found`,
        'RESOURCE_NOT_FOUND',
        { requestedResource: resourceUri }
      );
    });

    // Note: Custom health endpoint removed - MCP uses standard protocol methods only

    timer('completed');
    createRouterLogger.info('Router configured successfully', {
      data: {
        tools: Object.keys(tools).length,
        providers: Object.keys(dependencies.providers).length,
        continuationStore: dependencies.continuationStore.constructor.name,
        environment: config.environment.nodeEnv
      }
    });

    // Return router interface for testing purposes
    return {
      listTools: async () => {
        const tools = getTools();
        return {
          tools: Object.entries(tools).map(([name, tool]) => {
            const toolSchema = {
              name,
              description: tool.description || 'No description available'
            };

            if (tool.inputSchema) {
              toolSchema.inputSchema = tool.inputSchema;
            }

            return toolSchema;
          })
        };
      },

      callTool: async (toolCall) => {
        const toolName = toolCall.name;
        const toolArgs = toolCall.arguments || {};

        try {
          // Validate tool existence and callability
          const { tool } = validateTool(toolName, tools);

          // Validate tool arguments if schema is provided
          if (tool.inputSchema) {
            const isValidArgs = validateToolArguments(toolArgs, tool.inputSchema);
            if (!isValidArgs) {
              throw new ValidationError(
                `Invalid arguments for tool ${toolName}`,
                ERROR_CODES.INVALID_TOOL_ARGS,
                {
                  providedArgs: Object.keys(toolArgs),
                  expectedSchema: tool.inputSchema
                }
              );
            }
          }

          // Execute the tool with dependency injection
          return await tool(toolArgs, dependencies);
        } catch (error) {
          return createErrorResponse(error, toolName, {
            arguments: toolArgs,
            executionTime: 0,
            requestId: 'test'
          });
        }
      }
    };

  } catch (error) {
    timer('failed');
    createRouterLogger.error('Router initialization failed', { error });
    throw new RouterError(
      'Router initialization failed',
      ERROR_CODES.ROUTER_ERROR,
      { originalError: error.message }
    );
  }
}

/**
 * Get JSON Schema type for a JavaScript value
 * @param {any} value - The value to get type for
 * @returns {string} JSON Schema type
 */
function getJsonSchemaType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'integer' : 'number';
  }
  return typeof value;
}

/**
 * Check if a JavaScript value matches a JSON Schema type
 * @param {any} value - The value to check
 * @param {string} schemaType - The JSON Schema type to check against
 * @returns {boolean} True if value matches the schema type
 */
function isValidJsonSchemaType(value, schemaType) {
  if (schemaType === 'null') return value === null;
  if (schemaType === 'array') return Array.isArray(value);
  if (schemaType === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (schemaType === 'boolean') return typeof value === 'boolean';
  if (schemaType === 'string') return typeof value === 'string';
  if (schemaType === 'number') return typeof value === 'number';
  if (schemaType === 'integer') return typeof value === 'number' && Number.isInteger(value);

  // For unknown types, fall back to JavaScript typeof
  return typeof value === schemaType;
}

/**
 * Enhanced tool argument validation against schema
 * @param {object} args - Tool arguments to validate
 * @param {object} schema - JSON schema for validation
 * @returns {boolean} True if arguments are valid
 * @throws {RouterError} If validation fails with details
 */
export function validateToolArguments(args, schema) {
  try {
    // If no schema provided, assume valid
    if (!schema) {
      return true;
    }

    // Basic type checking
    if (schema.type === 'object' && (typeof args !== 'object' || args === null)) {
      throw new RouterError(
        'Arguments must be an object',
        'INVALID_ARGUMENT_TYPE',
        { expected: 'object', received: typeof args }
      );
    }

    // Check required properties
    if (schema.required && Array.isArray(schema.required)) {
      const missing = schema.required.filter(key => !(key in args));
      if (missing.length > 0) {
        throw new RouterError(
          `Validation error: Missing required arguments: ${missing.join(', ')}`,
          'MISSING_REQUIRED_ARGS',
          { missing, provided: Object.keys(args) }
        );
      }
    }

    // Validate individual properties
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in args) {
          const value = args[key];

          // Basic type validation using JSON Schema type semantics
          if (propSchema.type && !isValidJsonSchemaType(value, propSchema.type)) {
            const actualType = getJsonSchemaType(value);
            throw new RouterError(
              `Argument '${key}' must be of type ${propSchema.type}`,
              'INVALID_ARGUMENT_TYPE',
              {
                argument: key,
                expected: propSchema.type,
                received: actualType
              }
            );
          }

          // String length validation
          if (propSchema.type === 'string') {
            if (propSchema.minLength && value.length < propSchema.minLength) {
              throw new RouterError(
                `Argument '${key}' must be at least ${propSchema.minLength} characters`,
                'ARGUMENT_TOO_SHORT',
                { argument: key, minLength: propSchema.minLength, actual: value.length }
              );
            }
            if (propSchema.maxLength && value.length > propSchema.maxLength) {
              throw new RouterError(
                `Argument '${key}' must be at most ${propSchema.maxLength} characters`,
                'ARGUMENT_TOO_LONG',
                { argument: key, maxLength: propSchema.maxLength, actual: value.length }
              );
            }
          }
        }
      }
    }

    return true;

  } catch (error) {
    if (error instanceof RouterError) {
      throw error;
    }
    throw new RouterError(
      `Argument validation failed: ${error.message}`,
      'VALIDATION_ERROR',
      { originalError: error.message }
    );
  }
}

/**
 * Get router statistics and health information
 * @param {object} dependencies - Router dependencies
 * @returns {Promise<object>} Router statistics
 */
export async function getRouterStats(dependencies) {
  try {
    const tools = getTools();
    const storeStats = await dependencies.continuationStore.getStats();

    return {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      tools: {
        count: Object.keys(tools).length,
        available: Object.keys(tools)
      },
      providers: {
        count: Object.keys(dependencies.providers).length,
        available: Object.keys(dependencies.providers)
      },
      continuationStore: storeStats,
      memory: process.memoryUsage(),
      environment: dependencies.config.environment.nodeEnv
    };

  } catch (error) {
    throw new RouterError(
      'Failed to get router statistics',
      'STATS_ERROR',
      { error: error.message }
    );
  }
}
