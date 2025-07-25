/**
 * Token Limiter Utility
 *
 * Implements token limiting for MCP tool responses to prevent excessive output.
 * Based on the Python implementation's token limiting functionality.
 */

import { createLogger } from './logger.js';

const logger = createLogger('tokenLimiter');

/**
 * Simple token estimation based on character count
 * Rough approximation: 1 token ≈ 4 characters for English text
 * @param {string} text - Text to estimate tokens for
 * @returns {number} Estimated token count
 */
function estimateTokens(text) {
  if (!text || typeof text !== 'string') {
    return 0;
  }
  // Average of 4 characters per token for English text
  return Math.ceil(text.length / 4);
}

/**
 * Truncates text to fit within token limit while preserving structure
 * @param {string} text - Text to truncate
 * @param {number} maxTokens - Maximum allowed tokens
 * @returns {object} Object with truncated text and metadata
 */
function truncateToTokenLimit(text, maxTokens) {
  if (!text || typeof text !== 'string') {
    return {
      content: text || '',
      truncated: false,
      originalTokens: 0,
      finalTokens: 0,
      truncationReason: null
    };
  }

  const originalTokens = estimateTokens(text);
  
  if (originalTokens <= maxTokens) {
    return {
      content: text,
      truncated: false,
      originalTokens,
      finalTokens: originalTokens,
      truncationReason: null
    };
  }

  // Calculate maximum characters to keep (with some buffer for safety)
  const maxChars = Math.floor(maxTokens * 3.8); // Slightly less than 4 chars per token
  
  // Find a good truncation point (prefer complete sentences or paragraphs)
  let truncationPoint = maxChars;
  const text_substring = text.substring(0, maxChars + 200); // Look ahead a bit
  
  // Try to find sentence endings
  const sentenceEndings = ['. ', '.\n', '!\n', '?\n', '! ', '? '];
  let bestTruncation = maxChars;
  
  for (const ending of sentenceEndings) {
    const lastIndex = text_substring.lastIndexOf(ending);
    if (lastIndex > maxChars * 0.8 && lastIndex < maxChars) {
      bestTruncation = lastIndex + ending.length;
      break;
    }
  }
  
  // If no good sentence ending, try paragraph breaks
  if (bestTruncation === maxChars) {
    const paragraphBreak = text_substring.lastIndexOf('\n\n');
    if (paragraphBreak > maxChars * 0.8 && paragraphBreak < maxChars) {
      bestTruncation = paragraphBreak + 2;
    }
  }
  
  // If still no good break, try line breaks
  if (bestTruncation === maxChars) {
    const lineBreak = text_substring.lastIndexOf('\n');
    if (lineBreak > maxChars * 0.9 && lineBreak < maxChars) {
      bestTruncation = lineBreak + 1;
    }
  }
  
  const truncatedText = text.substring(0, bestTruncation);
  const finalTokens = estimateTokens(truncatedText);
  
  const truncationMessage = `\n\n[Response truncated due to length. Original: ~${originalTokens} tokens, Truncated: ~${finalTokens} tokens, Limit: ${maxTokens} tokens]`;
  
  return {
    content: truncatedText + truncationMessage,
    truncated: true,
    originalTokens,
    finalTokens: finalTokens + estimateTokens(truncationMessage),
    truncationReason: 'Exceeded maximum token limit'
  };
}

/**
 * Validates and applies token limits to MCP tool responses
 * @param {any} response - The response content to validate
 * @param {number} maxTokens - Maximum allowed tokens
 * @returns {object} Processed response with token limiting applied
 */
export function applyTokenLimit(response, maxTokens) {
  if (!maxTokens || maxTokens <= 0) {
    return {
      content: response,
      metadata: {
        tokenLimitApplied: false,
        originalTokens: 0,
        finalTokens: 0
      }
    };
  }

  // Handle different response types
  let textContent = '';
  let originalResponse = response;
  
  if (typeof response === 'string') {
    textContent = response;
  } else if (response && typeof response === 'object') {
    // Handle structured responses (like consensus tool)
    if (response.content && typeof response.content === 'string') {
      textContent = response.content;
    } else {
      // For complex objects, serialize to JSON for token counting
      textContent = JSON.stringify(response, null, 2);
    }
  } else {
    // Convert other types to string
    textContent = String(response);
  }

  const result = truncateToTokenLimit(textContent, maxTokens);
  
  if (result.truncated) {
    logger.warn('Response truncated due to token limit', {
      originalTokens: result.originalTokens,
      finalTokens: result.finalTokens,
      maxTokens,
      truncationRatio: (result.finalTokens / result.originalTokens).toFixed(3)
    });
  }

  // Return the processed response
  if (typeof originalResponse === 'string') {
    return {
      content: result.content,
      metadata: {
        tokenLimitApplied: result.truncated,
        originalTokens: result.originalTokens,
        finalTokens: result.finalTokens,
        truncationReason: result.truncationReason
      }
    };
  } else if (originalResponse && typeof originalResponse === 'object') {
    // For structured responses, update the content field
    return {
      ...originalResponse,
      content: result.content,
      metadata: {
        ...originalResponse.metadata,
        tokenLimitApplied: result.truncated,
        originalTokens: result.originalTokens,
        finalTokens: result.finalTokens,
        truncationReason: result.truncationReason
      }
    };
  } else {
    return {
      content: result.content,
      metadata: {
        tokenLimitApplied: result.truncated,
        originalTokens: result.originalTokens,
        finalTokens: result.finalTokens,
        truncationReason: result.truncationReason
      }
    };
  }
}

/**
 * Gets the configured token limit from environment or config
 * @param {object} config - Configuration object
 * @returns {number} Maximum token limit
 */
export function getTokenLimit(config) {
  if (config && config.mcp && config.mcp.max_mcp_output_tokens) {
    return config.mcp.max_mcp_output_tokens;
  }
  
  // Fallback to environment variable
  const envLimit = process.env.MAX_MCP_OUTPUT_TOKENS;
  if (envLimit) {
    const limit = parseInt(envLimit, 10);
    if (!isNaN(limit) && limit > 0) {
      return limit;
    }
  }
  
  // Default limit
  return 25000;
}

/**
 * Estimates token count for a given text (exported for testing)
 * @param {string} text - Text to estimate
 * @returns {number} Estimated token count
 */
export { estimateTokens };