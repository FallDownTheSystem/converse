/**
 * Tool Registry
 *
 * Central registry for all MCP tools following functional architecture.
 * Each tool receives dependencies via injection and returns MCP-compatible responses.
 */

// Import individual tools
import { chatTool } from './chat.js';
import { consensusTool } from './consensus.js';
import { checkStatusTool } from './checkStatus.js';
import { cancelJobTool } from './cancelJob.js';

/**
 * Tool registry map
 * Each tool must implement: async function(args, dependencies) => mcpResponse
 * Tools also have metadata: description, inputSchema
 */
const tools = {
  chat: chatTool,
  consensus: consensusTool,
  check_status: checkStatusTool,
  cancel_job: cancelJobTool,
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
 * Format metadata for display in tool responses
 * @param {object} metadata - Metadata to format
 * @param {string} toolName - Name of the tool
 * @param {number} executionTime - Execution time in seconds
 * @param {boolean} enableDisplay - Whether to enable metadata display
 * @returns {string} Formatted metadata string
 */
export function formatMetadataDisplay(metadata = {}, toolName = '', executionTime = null, enableDisplay = true) {
  // Return empty string if display is disabled (useful for testing)
  if (!enableDisplay) {
    return '';
  }

  const parts = [];

  // Use elapsed_seconds from job if available, otherwise use executionTime
  const timeToShow = metadata.elapsed_seconds !== undefined ? metadata.elapsed_seconds : executionTime;

  if (timeToShow !== null) {
    // Format time appropriately based on duration
    let timeDisplay;
    if (timeToShow >= 60) {
      // Show minutes and seconds for long requests
      const minutes = Math.floor(timeToShow / 60);
      const seconds = Math.round(timeToShow % 60);
      timeDisplay = `${minutes}m${seconds}s`;
    } else if (timeToShow >= 1) {
      // Show seconds with 1 decimal place for requests over 1 second
      timeDisplay = `${timeToShow.toFixed(1)}s`;
    } else {
      // Show seconds with 2 decimal places for sub-second requests
      timeDisplay = `${timeToShow.toFixed(2)}s`;
    }
    parts.push(`⏱️ ${timeDisplay}`);
  }

  if (metadata.successful_models !== undefined) {
    parts.push(`✅ ${metadata.successful_models}/${metadata.total_models} models`);
  }

  if (metadata.continuation_id) {
    parts.push(`🔗 ${metadata.continuation_id}`);
  }

  if (metadata.models_list) {
    // For consensus tool with multiple models
    parts.push(`🤖 ${metadata.models_list}`);
  } else if (metadata.provider) {
    parts.push(`🤖 ${metadata.provider}`);
  }

  if (metadata.model && !metadata.models_list) {
    parts.push(`📱 ${metadata.model}`);
  }

  return parts.length > 0 ? `[${parts.join(' | ')}]` : '';
}

/**
 * Format failure details for display in tool responses
 * @param {array} failureDetails - Array of failure detail strings
 * @returns {string} Formatted failure details string
 */
export function formatFailureDetails(failureDetails = []) {
  if (!failureDetails || failureDetails.length === 0) {
    return '';
  }

  const failureList = failureDetails.map(detail => `• ${detail}`).join('\n');
  return `\nModel failures:\n${failureList}`;
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
    if (content.continuation || content.metadata || content.content || content.metadata_display) {
      // Prepare the text content, potentially prefixing with metadata display
      let textContent = content.content || JSON.stringify(content, null, 2);
      if (content.metadata_display) {
        textContent = `${content.metadata_display}\n\n${textContent}`;
      }

      const mcpResponse = {
        content: [
          {
            type: 'text',
            text: textContent
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
