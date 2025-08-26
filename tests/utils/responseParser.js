/**
 * Response Parser Utilities
 * 
 * Centralized helpers for parsing different response formats from the MCP tools.
 * Handles both human-readable status lines and JSON responses.
 */

/**
 * Parse human-readable status format from check_status tool
 * @param {string} text - The response text from check_status
 * @returns {object} Parsed status object
 */
export function parseStatusResponse(text) {
  const lines = text.split('\n');
  const statusLine = lines[0];
  
  // Parse status line: "🔄 RUNNING | CHAT | job_test123 | 5.0s elapsed | provider/model"
  const parts = statusLine.split(' | ');
  const statusWithEmoji = parts[0] || '';
  const statusParts = statusWithEmoji.split(' ');
  const status = statusParts[statusParts.length - 1]?.toLowerCase() || '';
  const tool = parts[1]?.toLowerCase() || '';
  const continuationId = parts[2] || '';
  
  // Extract time value
  const timeStr = parts[3] || '';
  const timeMatch = timeStr.match(/([\d.]+)/);
  const elapsedSeconds = timeMatch ? parseFloat(timeMatch[1]) : 0;
  
  // Extract provider/model if present
  let provider = null;
  let model = null;
  if (parts[4] && !parts[4].includes('/')) {
    // Consensus progress format: "2/3 refined"
    const consensusProgress = parts[4];
  } else if (parts[4]) {
    // Provider/model format: "openai/gpt-5"
    const providerModel = parts[4].split('/');
    provider = providerModel[0] || null;
    model = providerModel[1] || null;
  }
  
  // Check for completion response - new format shows full content after status line and continuation_id
  let result = null;
  if (status === 'completed') {
    // Find content after status line and optional continuation_id line
    const statusLineIndex = lines.findIndex(line => line.includes('COMPLETED'));
    if (statusLineIndex >= 0) {
      // Skip status line and any continuation_id line
      let contentStartIndex = statusLineIndex + 1;
      while (contentStartIndex < lines.length && 
             (lines[contentStartIndex].trim() === '' || 
              lines[contentStartIndex].trim().startsWith('continuation_id:'))) {
        contentStartIndex++;
      }
      
      if (contentStartIndex < lines.length) {
        const content = lines.slice(contentStartIndex).join('\n').trim();
        if (content) {
          result = { content };
        }
      }
    }
  }
  
  // Check for error
  let error = null;
  const errorLine = lines.find(l => l.startsWith('Error: '));
  if (errorLine) {
    error = errorLine.substring('Error: '.length);
  }
  
  // Check for streaming preview
  let streamingPreview = null;
  const streamingLine = lines.find(l => l.startsWith('Streaming: "'));
  if (streamingLine) {
    streamingPreview = streamingLine.match(/Streaming: "([^"]+)"/)?.[1] || null;
  }
  
  return {
    status,
    tool,
    continuation_id: continuationId,
    elapsed_seconds: elapsedSeconds,
    provider,
    model,
    result,
    error,
    streaming_preview: streamingPreview
  };
}

/**
 * Parse JSON response that may have a status line prefix
 * @param {string} text - The response text that may contain JSON
 * @returns {object} Parsed JSON object
 */
export function parseJsonResponse(text) {
  // Check if response starts with status line or JSON
  const firstChar = text.trim()[0];
  
  if (firstChar === '{') {
    // Pure JSON response (no status line)
    // Find where JSON ends (look for the final closing brace)
    let braceCount = 0;
    let jsonEndIndex = -1;
    
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '{') braceCount++;
      if (text[i] === '}') {
        braceCount--;
        if (braceCount === 0) {
          jsonEndIndex = i + 1;
          break;
        }
      }
    }
    
    if (jsonEndIndex === -1) {
      // If we can't find the end, try parsing the whole thing
      return JSON.parse(text);
    }
    
    const jsonText = text.substring(0, jsonEndIndex);
    return JSON.parse(jsonText);
  } else {
    // Has status line - skip it and find JSON
    const lines = text.split('\n');
    const jsonStart = lines.findIndex(line => line.trim().startsWith('{'));
    
    if (jsonStart === -1) {
      throw new Error('No JSON found in response: ' + text.substring(0, 200));
    }
    
    // Find the end of JSON by counting braces
    const jsonLines = lines.slice(jsonStart);
    const jsonText = jsonLines.join('\n');
    
    let braceCount = 0;
    let jsonEndIndex = -1;
    
    for (let i = 0; i < jsonText.length; i++) {
      if (jsonText[i] === '{') braceCount++;
      if (jsonText[i] === '}') {
        braceCount--;
        if (braceCount === 0) {
          jsonEndIndex = i + 1;
          break;
        }
      }
    }
    
    if (jsonEndIndex === -1) {
      // If we can't find the end, try parsing the whole thing
      return JSON.parse(jsonText);
    }
    
    return JSON.parse(jsonText.substring(0, jsonEndIndex));
  }
}

/**
 * Parse async tool response (which should contain continuation_id)
 * @param {string} text - The response text from an async tool call
 * @returns {object} Parsed response with continuation_id
 */
export function parseAsyncResponse(text) {
  try {
    // Async responses should be pure JSON
    return parseJsonResponse(text);
  } catch (error) {
    console.error('Failed to parse async response:', text.substring(0, 500));
    throw error;
  }
}