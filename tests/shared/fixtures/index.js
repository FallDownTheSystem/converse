/**
 * Comprehensive test fixtures
 * Consolidates all test data and fixtures
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Sample responses for different providers
 */
export const responses = {
  openai: {
    chat: {
      id: 'chatcmpl-test123',
      object: 'chat.completion',
      created: 1234567890,
      model: 'gpt-4',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'This is a test response from OpenAI.',
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      },
    },
    streaming: {
      chunks: [
        { choices: [{ delta: { content: 'Hello' } }] },
        { choices: [{ delta: { content: ' world' } }] },
        { choices: [{ delta: { content: '!' } }] },
      ],
    },
  },
  google: {
    generateContent: {
      candidates: [
        {
          content: {
            parts: [{ text: 'This is a test response from Google.' }],
            role: 'model',
          },
          finishReason: 'STOP',
        },
      ],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 20,
        totalTokenCount: 30,
      },
    },
  },
  xai: {
    chat: {
      id: 'xai-test123',
      object: 'chat.completion',
      created: 1234567890,
      model: 'grok-2',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'This is a test response from XAI.',
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      },
    },
  },
  anthropic: {
    message: {
      id: 'msg_test123',
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: 'This is a test response from Anthropic.',
        },
      ],
      model: 'claude-3-5-sonnet-20241022',
      stop_reason: 'end_turn',
      usage: {
        input_tokens: 10,
        output_tokens: 20,
      },
    },
  },
};

/**
 * Sample file contents
 */
export const files = {
  text: {
    path: 'files/sample.txt',
    content: 'This is a sample text file for testing.',
    mimeType: 'text/plain',
  },
  json: {
    path: 'files/sample.json',
    content: JSON.stringify({ test: true, data: 'sample' }, null, 2),
    mimeType: 'application/json',
  },
  markdown: {
    path: 'files/sample.md',
    content: '# Sample Markdown\n\nThis is a **test** markdown file.',
    mimeType: 'text/markdown',
  },
  code: {
    javascript: {
      path: 'files/sample.js',
      content: 'function hello() {\n  return "Hello, World!";\n}',
      mimeType: 'application/javascript',
    },
    python: {
      path: 'files/sample.py',
      content: 'def hello():\n    return "Hello, World!"',
      mimeType: 'text/x-python',
    },
  },
};

/**
 * Sample image data
 */
export const images = {
  png: {
    path: 'images/sample.png',
    base64:
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    mimeType: 'image/png',
    description: '1x1 red pixel PNG',
  },
  jpeg: {
    path: 'images/sample.jpg',
    base64:
      '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=',
    mimeType: 'image/jpeg',
    description: '1x1 white pixel JPEG',
  },
};

/**
 * Error scenarios
 */
export const errors = {
  api: {
    openai: {
      rateLimit: {
        error: {
          message: 'Rate limit exceeded',
          type: 'rate_limit_error',
          code: 'rate_limit_exceeded',
        },
      },
      invalidKey: {
        error: {
          message: 'Invalid API key',
          type: 'invalid_request_error',
          code: 'invalid_api_key',
        },
      },
    },
    google: {
      quotaExceeded: {
        error: {
          code: 429,
          message: 'Quota exceeded',
          status: 'RESOURCE_EXHAUSTED',
        },
      },
    },
  },
  validation: {
    missingRequired: new Error('Missing required parameter: prompt'),
    invalidType: new Error(
      'Invalid parameter type: expected string, got number',
    ),
    pathNotFound: new Error('File not found: /invalid/path.txt'),
  },
};

/**
 * Test prompts
 */
export const prompts = {
  simple: 'What is 2+2?',
  complex:
    'Explain the concept of recursion in computer science with examples.',
  multiline: `Please analyze the following code:
function factorial(n) {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}`,
  withContext:
    'Based on the provided file, what is the main purpose of the function?',
  consensus:
    'Should we use microservices or monolithic architecture for our e-commerce platform?',
};

/**
 * Model configurations
 */
export const models = {
  fast: ['gpt-3.5-turbo', 'gemini-2.5-flash', 'grok-2-mini'],
  intelligent: [
    'gpt-4',
    'gemini-2.5-pro',
    'grok-2',
    'claude-3-5-sonnet-20241022',
  ],
  streaming: ['gpt-4', 'claude-3-5-sonnet-20241022'],
  webSearch: ['gpt-4', 'grok-2', 'grok-3'],
};

/**
 * Continuation data
 */
export const continuations = {
  chat: {
    id: 'chat_1234567890_abc123',
    messages: [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi! How can I help you?' },
      { role: 'user', content: 'What is recursion?' },
    ],
    metadata: {
      model: 'gpt-4',
      temperature: 0.7,
      created: Date.now(),
    },
  },
  consensus: {
    id: 'consensus_1234567890_xyz789',
    context: 'Previous discussion about architecture choices',
    decisions: ['Use microservices for scalability', 'Implement API gateway'],
  },
};

/**
 * Get absolute path to a fixture
 */
export function getFixturePath(relativePath) {
  return path.join(__dirname, relativePath);
}

/**
 * Load fixture content
 */
export async function loadFixture(fixturePath) {
  const fs = await import('fs/promises');
  const absolutePath = getFixturePath(fixturePath);
  return fs.readFile(absolutePath, 'utf-8');
}

/**
 * Create test data combinations
 */
export function createTestMatrix(options) {
  const {
    providers = ['openai', 'google', 'xai'],
    models: modelList = models.fast,
    scenarios = ['success', 'error'],
  } = options;

  const matrix = [];

  for (const provider of providers) {
    for (const model of modelList) {
      for (const scenario of scenarios) {
        matrix.push({
          provider,
          model,
          scenario,
          description: `${provider} - ${model} - ${scenario}`,
        });
      }
    }
  }

  return matrix;
}

/**
 * Export all fixtures
 */
export default {
  responses,
  files,
  images,
  errors,
  prompts,
  models,
  continuations,
  getFixturePath,
  loadFixture,
  createTestMatrix,
};
