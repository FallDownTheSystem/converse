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

  // Parse status line - format varies with position of title and provider/model
  // Examples:
  // "🔄 RUNNING | CHAT | job_test123 | 1/1 | Started: date | 5.0s elapsed | provider/model"
  // "🔄 RUNNING | CHAT | job_test123 | 1/1 | Started: date | 5.0s elapsed | "title" | provider/model"
  // "✅ COMPLETED | CHAT | job_test123 | 1/1 | Started: date | 5.0s elapsed | "title" | provider/model"
  const parts = statusLine.split(' | ');
  const statusWithEmoji = parts[0] || '';
  const statusParts = statusWithEmoji.split(' ');
  const status = statusParts[statusParts.length - 1]?.toLowerCase() || '';
  const tool = parts[1]?.toLowerCase() || '';
  const continuationId = parts[2] || '';

  // Find elapsed time part (contains "elapsed")
  let elapsedSeconds = 0;
  let elapsedIndex = -1;
  for (let i = 3; i < parts.length; i++) {
    if (parts[i] && parts[i].includes('elapsed')) {
      const timeMatch = parts[i].match(/([\d.]+)([ms])/);
      if (timeMatch) {
        elapsedSeconds = timeMatch[2] === 'm'
          ? parseFloat(timeMatch[1]) * 60
          : parseFloat(timeMatch[1]);
      }
      elapsedIndex = i;
      break;
    }
  }

  // Extract title and provider/model based on what comes after elapsed time
  let title = null;
  let provider = null;
  let model = null;

  if (elapsedIndex >= 0 && elapsedIndex < parts.length - 1) {
    const nextPart = parts[elapsedIndex + 1];

    // Check if next part is a quoted title
    if (nextPart && nextPart.startsWith('"') && nextPart.endsWith('"')) {
      title = nextPart.slice(1, -1);

      // Provider/model should be the next part after title
      if (elapsedIndex + 2 < parts.length) {
        const providerPart = parts[elapsedIndex + 2];
        if (providerPart && providerPart.includes('/')) {
          const [p, m] = providerPart.split('/');
          provider = p;
          model = m;
        }
      }
    } else if (nextPart && nextPart.includes('/')) {
      // No title, just provider/model
      const [p, m] = nextPart.split('/');
      provider = p;
      model = m;
    }
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

  // Check for streaming preview or summary
  let streamingPreview = null;
  let accumulated_content = null;
  const streamingLine = lines.find(l => l.startsWith('Streaming: "'));
  const summaryLine = lines.find(l => l.startsWith('Summary: ') && !l.startsWith('Summary: ${'));

  if (streamingLine) {
    streamingPreview = streamingLine.match(/Streaming: "([^"]+)"/)?.[1] || null;
    accumulated_content = streamingPreview; // For running jobs, this is the preview
  } else if (summaryLine) {
    // Extract summary text (could be streaming summary or final summary)
    accumulated_content = summaryLine.substring('Summary: '.length).trim();
  }

  // Extract final summary for completed jobs
  let final_summary = null;
  if (status === 'completed' && summaryLine) {
    final_summary = summaryLine.substring('Summary: '.length).trim();
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
    accumulated_content,
    title,
    final_summary
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
