/**
 * Conversation Exporter
 *
 * Exports chat conversations to disk with incremental file writes
 * and atomic metadata updates. Follows functional architecture patterns.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { createLogger } from './logger.js';

const logger = createLogger('conversationExporter');

/**
 * Write file only if it doesn't exist (write-if-missing pattern)
 * @param {string} filePath - Path to file
 * @param {string} content - Content to write
 * @returns {Promise<boolean>} True if written, false if skipped
 */
async function writeIfMissing(filePath, content) {
  try {
    // Check if file exists
    await fs.access(filePath);
    // File exists, skip writing
    return false;
  } catch {
    // File doesn't exist, write it
    try {
      await fs.writeFile(filePath, content, 'utf8');
      return true;
    } catch (error) {
      logger.warn(`Failed to write file ${filePath}`, { error });
      return false;
    }
  }
}

/**
 * Write file atomically (write to temp, then rename)
 * @param {string} filePath - Target file path
 * @param {string} content - Content to write
 * @returns {Promise<void>}
 */
async function writeAtomic(filePath, content) {
  const tempPath = `${filePath}.tmp`;
  try {
    await fs.writeFile(tempPath, content, 'utf8');
    await fs.rename(tempPath, filePath);
  } catch (error) {
    // Try to clean up temp file if rename failed
    try {
      await fs.unlink(tempPath);
    } catch {
      // Ignore cleanup error
    }
    throw error;
  }
}

/**
 * Extract turn pairs from conversation messages
 * @param {Array} messages - Conversation messages array
 * @returns {Array} Array of {user, assistant} turn pairs
 */
function extractTurns(messages) {
  const turns = [];
  let currentTurn = null;

  for (const msg of messages) {
    // Skip system messages
    if (msg.role === 'system') continue;

    if (msg.role === 'user') {
      // Start new turn
      if (currentTurn && !currentTurn.assistant) {
        // Previous turn incomplete, save it anyway
        turns.push(currentTurn);
      }
      currentTurn = { user: msg, assistant: null };
    } else if (msg.role === 'assistant' && currentTurn) {
      // Complete current turn
      currentTurn.assistant = msg;
      turns.push(currentTurn);
      currentTurn = null;
    }
  }

  // Handle incomplete final turn
  if (currentTurn && currentTurn.user) {
    turns.push(currentTurn);
  }

  return turns;
}

/**
 * Extract content from message (handles both string and complex content)
 * @param {object} message - Message object
 * @returns {string} Extracted content
 */
function extractMessageContent(message) {
  if (!message) return '';

  const content = message.content;

  // Handle simple string content
  if (typeof content === 'string') {
    return content;
  }

  // Handle complex content array (files/images + text)
  if (Array.isArray(content)) {
    const textParts = [];

    for (const part of content) {
      if (part.type === 'text' && part.text) {
        textParts.push(part.text);
      } else if (part.type === 'file' && part.file_content) {
        // Include file reference in export
        textParts.push(`[File: ${part.file_name || 'unknown'}]`);
      } else if (part.type === 'image' && part.image_url) {
        // Include image reference in export
        const imageName = part.image_url.startsWith('data:')
          ? 'embedded image'
          : path.basename(part.image_url);
        textParts.push(`[Image: ${imageName}]`);
      }
    }

    return textParts.join('\n\n');
  }

  return '';
}

/**
 * Generate metadata for the conversation
 * @param {object} conversationState - Current conversation state
 * @param {number} totalTurns - Total number of turns
 * @param {object} params - Additional parameters from chat tool
 * @returns {object} Metadata object
 */
function generateMetadata(conversationState, totalTurns, params) {
  const metadata = {
    continuation_id: params.continuation_id,
    model: params.model || 'auto',
    provider: conversationState.provider,
    temperature: params.temperature || 0.5,
    total_turns: totalTurns,
    created_at: conversationState.createdAt
      ? new Date(conversationState.createdAt).toISOString()
      : new Date().toISOString(),
    last_updated: new Date(conversationState.lastUpdated || Date.now()).toISOString(),
  };

  // Add optional parameters if present
  if (params.reasoning_effort) {
    metadata.reasoning_effort = params.reasoning_effort;
  }
  if (params.verbosity) {
    metadata.verbosity = params.verbosity;
  }
  if (params.use_websearch !== undefined) {
    metadata.use_websearch = params.use_websearch;
  }
  if (params.files && params.files.length > 0) {
    metadata.files = params.files;
  }
  if (params.images && params.images.length > 0) {
    // Don't store base64 data, just file paths or indicators
    metadata.images = params.images.map(img =>
      img.startsWith('data:') ? '[base64 image]' : img
    );
  }

  return metadata;
}

/**
 * Export conversation to disk
 * @param {object} conversationState - Conversation state from continuation store
 * @param {object} options - Export options
 * @returns {Promise<void>}
 */
export async function exportConversation(conversationState, options = {}) {
  const {
    clientCwd,
    continuation_id,
    model,
    temperature,
    reasoning_effort,
    verbosity,
    use_websearch,
    files,
    images,
  } = options;

  if (!continuation_id) {
    logger.warn('Export skipped: no continuation_id provided');
    return;
  }

  try {
    // 1. Sanitize continuation ID for folder name
    const safeId = path.basename(continuation_id);
    const exportDir = path.resolve(clientCwd || process.cwd(), safeId);

    // 2. Ensure directory exists
    await fs.mkdir(exportDir, { recursive: true });
    logger.debug(`Export directory created/verified: ${exportDir}`);

    // 3. Extract turns from conversation
    const turns = extractTurns(conversationState.messages);

    if (turns.length === 0) {
      logger.debug('No turns to export');
      return;
    }

    // 4. Write request/response files (skip existing)
    let filesWritten = 0;
    for (const [index, turn] of turns.entries()) {
      const turnNum = index + 1;

      // Write request file if missing
      if (turn.user) {
        const requestPath = path.join(exportDir, `${turnNum}_request.txt`);
        const userContent = extractMessageContent(turn.user);
        const written = await writeIfMissing(requestPath, userContent);
        if (written) filesWritten++;
      }

      // Write response file if missing
      if (turn.assistant) {
        const responsePath = path.join(exportDir, `${turnNum}_response.txt`);
        const assistantContent = extractMessageContent(turn.assistant);
        const written = await writeIfMissing(responsePath, assistantContent);
        if (written) filesWritten++;
      }
    }

    // 5. Always update metadata atomically
    const metadata = generateMetadata(conversationState, turns.length, {
      continuation_id,
      model,
      temperature,
      reasoning_effort,
      verbosity,
      use_websearch,
      files,
      images,
    });

    const metadataPath = path.join(exportDir, 'metadata.json');
    await writeAtomic(metadataPath, JSON.stringify(metadata, null, 2));

    logger.info('Conversation exported', {
      continuation_id,
      exportDir,
      totalTurns: turns.length,
      filesWritten,
    });
  } catch (error) {
    // Log error but don't interrupt conversation
    logger.error('Export failed', { error, continuation_id });
  }
}
