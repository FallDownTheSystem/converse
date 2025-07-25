/**
 * Tool Registry
 *
 * Central registry for all MCP tools following functional architecture.
 * Each tool receives dependencies via injection and returns MCP-compatible responses.
 */

// Import individual tools
import { chatTool } from './chat.js';
import { consensusTool } from './consensus.js';

/**
 * Tool registry map
 * Each tool must implement: async function(args, dependencies) => mcpResponse
 * Tools also have metadata: description, inputSchema
 */
const tools = {
  chat: chatTool,
  consensus: consensusTool,
};

/**
 * Get all available tools
 * @returns {object} Map of tool name to tool implementation
 */
export function getTools() {
  return tools;
}

/**
 * Get a specific tool by name
 * @param {string} name - Tool name
 * @returns {object|null} Tool implementation or null if not found
 */
export function getTool(name) {
  return tools[name] || null;
}

/**
 * Register a new tool
 * @param {string} name - Tool name
 * @param {function} toolHandler - Tool implementation function
 * @param {object} metadata - Tool metadata (description, inputSchema)
 */
export function registerTool(name, toolHandler, metadata = {}) {
  // Validate tool interface
  if (typeof toolHandler !== 'function') {
    throw new Error(`Tool ${name} must be a function`);
  }

  // Add metadata to tool function
  toolHandler.description = metadata.description || `${name} tool`;
  toolHandler.inputSchema = metadata.inputSchema || {
    type: 'object',
    properties: {},
  };

  tools[name] = toolHandler;
}

/**
 * Get list of available tool names
 * @returns {string[]} Array of tool names
 */
export function getAvailableTools() {
  return Object.keys(tools);
}

/**
 * Create MCP-compatible tool response
 * @param {string|object} content - Response content (string) or full response object
 * @param {boolean} isError - Whether this is an error response
 * @param {object} additionalFields - Additional fields to include in response
 * @returns {object} MCP tool response
 */
export function createToolResponse(content, isError = false, additionalFields = {}) {
  // If content is already a structured response object, use it directly
  if (typeof content === 'object' && content !== null && !Array.isArray(content)) {
    // If it's a complete response object with content array, return it directly
    if (content.content && Array.isArray(content.content)) {
      return {
        ...content,
        isError: isError || content.isError || false,
        ...additionalFields
      };
    }
    
    // If it's a tool result object (has continuation, metadata, etc.) convert to MCP format
    if (content.continuation || content.metadata || content.content) {
      const mcpResponse = {
        content: [
          {
            type: 'text',
            text: content.content || JSON.stringify(content, null, 2)
          }
        ],
        isError: isError || content.isError || false,
        ...additionalFields
      };
      
      // Preserve continuation and metadata at top level
      if (content.continuation) {
        mcpResponse.continuation = content.continuation;
      }
      if (content.metadata) {
        mcpResponse.metadata = content.metadata;
      }
      
      return mcpResponse;
    }
    
    // If it's any other object, stringify it
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(content, null, 2),
        },
      ],
      isError,
      ...additionalFields
    };
  }
  
  // Handle string content
  return {
    content: [
      {
        type: 'text',
        text: content,
      },
    ],
    isError,
    ...additionalFields
  };
}

/**
 * Create MCP-compatible tool error response
 * @param {string} message - Error message
 * @param {Error} error - Original error object
 * @returns {object} MCP error response
 */
export function createToolError(message, error = null) {
  const errorText = error ? `${message}: ${error.message}` : message;
  const response = createToolResponse(errorText, true);
  
  // Add error object for test compatibility
  response.error = {
    message: errorText,
    type: 'ToolError',
    timestamp: new Date().toISOString()
  };
  
  return response;
}
