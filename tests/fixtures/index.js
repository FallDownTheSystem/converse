/**
 * Central export for test fixtures
 * @module tests/fixtures
 * 
 * This module provides comprehensive test fixtures for all test suites
 * including provider responses, tool inputs/outputs, error scenarios,
 * and edge cases.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load JSON files using readFileSync for compatibility
const __dirname = dirname(fileURLToPath(import.meta.url));
const sampleResponses = JSON.parse(readFileSync(join(__dirname, 'data', 'sample-responses.json'), 'utf8'));
const providerResponses = JSON.parse(readFileSync(join(__dirname, 'data', 'provider-responses.json'), 'utf8'));
const toolFixtures = JSON.parse(readFileSync(join(__dirname, 'data', 'tool-fixtures.json'), 'utf8'));
const errorScenarios = JSON.parse(readFileSync(join(__dirname, 'data', 'error-scenarios.json'), 'utf8'));
const edgeCases = JSON.parse(readFileSync(join(__dirname, 'data', 'edge-cases.json'), 'utf8'));

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Export fixture data
export {
  sampleResponses,
  providerResponses,
  toolFixtures,
  errorScenarios,
  edgeCases
};

// Export fixture paths
export const FIXTURE_PATHS = {
  // Text files
  sampleText: './files/sample.txt',
  largeText: './files/large-text.txt',
  unicodeText: './files/unicode-text.txt',
  
  // JSON files
  sampleJson: './files/sample.json',
  nestedJson: './files/nested.json',
  largeJson: './files/large.json',
  
  // Code files
  javascriptFile: './files/sample.js',
  pythonFile: './files/sample.py',
  typeScriptFile: './files/sample.ts',
  
  // Special files
  emptyFile: './files/empty.txt',
  binaryFile: './files/binary.bin',
  specialCharsFile: './files/special-chars.txt',
  
  // Response data
  responses: './data/sample-responses.json',
  providerResponses: './data/provider-responses.json',
  toolFixtures: './data/tool-fixtures.json',
  errorScenarios: './data/error-scenarios.json',
  edgeCases: './data/edge-cases.json'
};

/**
 * Load a fixture file synchronously
 * @param {string} fixturePath - Relative path to the fixture
 * @returns {string} File content
 */
export function loadFixtureSync(fixturePath) {
  const absolutePath = join(__dirname, fixturePath);
  return readFileSync(absolutePath, 'utf-8');
}

/**
 * Load a fixture file asynchronously
 * @param {string} fixturePath - Relative path to the fixture
 * @returns {Promise<string>} File content
 */
export async function loadFixture(fixturePath) {
  const { readFile } = await import('fs/promises');
  const absolutePath = join(__dirname, fixturePath);
  return readFile(absolutePath, 'utf-8');
}

/**
 * Get absolute path to a fixture
 * @param {string} fixturePath - Relative path to the fixture
 * @returns {string} Absolute path
 */
export function getFixturePath(fixturePath) {
  return join(__dirname, fixturePath);
}

/**
 * Create a mock response for a specific provider and model
 * @param {string} provider - Provider name
 * @param {string} model - Model name
 * @param {string} content - Response content
 * @param {Object} options - Additional options
 * @returns {Object} Mock response
 */
export function createMockResponse(provider, model, content, options = {}) {
  const template = providerResponses[provider]?.models[model] || providerResponses[provider]?.default;
  if (!template) {
    throw new Error(`No response template found for ${provider}/${model}`);
  }
  
  // Deep clone the template
  const response = JSON.parse(JSON.stringify(template));
  
  // Update content based on provider format
  switch (provider) {
    case 'openai':
    case 'xai':
    case 'openrouter':
    case 'deepseek':
    case 'mistral':
      response.choices[0].message.content = content;
      if (options.usage) {
        response.usage = { ...response.usage, ...options.usage };
      }
      break;
    case 'google':
      response.candidates[0].content.parts[0].text = content;
      if (options.usage) {
        response.usageMetadata = { ...response.usageMetadata, ...options.usage };
      }
      break;
    case 'anthropic':
      response.content[0].text = content;
      if (options.usage) {
        response.usage = { ...response.usage, ...options.usage };
      }
      break;
  }
  
  return response;
}

/**
 * Create a streaming response for testing
 * @param {string} provider - Provider name
 * @param {string[]} chunks - Array of text chunks
 * @returns {Array} Array of streaming chunks
 */
export function createStreamingResponse(provider, chunks) {
  const streamingData = providerResponses[provider]?.streaming;
  if (!streamingData) {
    throw new Error(`No streaming template found for ${provider}`);
  }
  
  return chunks.map((chunk, index) => {
    const chunkTemplate = JSON.parse(JSON.stringify(streamingData.chunk));
    
    switch (provider) {
      case 'openai':
      case 'xai':
      case 'openrouter':
        chunkTemplate.choices[0].delta.content = chunk;
        chunkTemplate.choices[0].index = 0;
        if (index === chunks.length - 1) {
          chunkTemplate.choices[0].finish_reason = 'stop';
        }
        break;
      case 'anthropic':
        if (index === 0) {
          return { type: 'message_start', message: { id: 'msg_test', model: 'claude-3-5-sonnet-20241022' } };
        } else if (index === chunks.length - 1) {
          return { type: 'message_delta', delta: { stop_reason: 'end_turn' } };
        }
        chunkTemplate.delta.text = chunk;
        break;
    }
    
    return chunkTemplate;
  });
}

/**
 * Get error response for a specific scenario
 * @param {string} provider - Provider name
 * @param {string} errorType - Error type (e.g., 'rateLimit', 'invalidKey')
 * @returns {Object} Error response
 */
export function getErrorResponse(provider, errorType) {
  const errorData = errorScenarios[provider]?.[errorType];
  if (!errorData) {
    throw new Error(`No error scenario found for ${provider}/${errorType}`);
  }
  return JSON.parse(JSON.stringify(errorData));
}

/**
 * Get tool fixture data
 * @param {string} tool - Tool name ('chat' or 'consensus')
 * @param {string} scenario - Scenario name
 * @returns {Object} Tool fixture data
 */
export function getToolFixture(tool, scenario) {
  const fixture = toolFixtures[tool]?.[scenario];
  if (!fixture) {
    throw new Error(`No fixture found for ${tool}/${scenario}`);
  }
  return JSON.parse(JSON.stringify(fixture));
}

/**
 * Get edge case data
 * @param {string} category - Category name
 * @param {string} caseName - Case name
 * @returns {*} Edge case data
 */
export function getEdgeCase(category, caseName) {
  const edgeCase = edgeCases[category]?.[caseName];
  if (edgeCase === undefined) {
    throw new Error(`No edge case found for ${category}/${caseName}`);
  }
  return JSON.parse(JSON.stringify(edgeCase));
}

/**
 * Create a test matrix for multiple providers and models
 * @param {Object} options - Matrix options
 * @returns {Array} Test matrix
 */
export function createTestMatrix(options = {}) {
  const {
    providers = ['openai', 'google', 'xai', 'anthropic'],
    models = {
      openai: ['gpt-4', 'gpt-3.5-turbo'],
      google: ['gemini-2.5-pro', 'gemini-2.5-flash'],
      xai: ['grok-4', 'grok-2'],
      anthropic: ['claude-3-5-sonnet-20241022']
    },
    scenarios = ['success', 'error', 'streaming']
  } = options;
  
  const matrix = [];
  
  for (const provider of providers) {
    const providerModels = models[provider] || [];
    for (const model of providerModels) {
      for (const scenario of scenarios) {
        matrix.push({
          provider,
          model,
          scenario,
          key: `${provider}-${model}-${scenario}`
        });
      }
    }
  }
  
  return matrix;
}

// Default export
export default {
  sampleResponses,
  providerResponses,
  toolFixtures,
  errorScenarios,
  edgeCases,
  FIXTURE_PATHS,
  loadFixture,
  loadFixtureSync,
  getFixturePath,
  createMockResponse,
  createStreamingResponse,
  getErrorResponse,
  getToolFixture,
  getEdgeCase,
  createTestMatrix
};