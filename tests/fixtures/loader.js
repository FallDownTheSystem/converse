/**
 * Fixture Loader Utility
 * Provides easy access to all test fixtures with helper functions
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import fixtures from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * FixtureLoader class for managing test fixtures
 */
export class FixtureLoader {
  constructor() {
    this.basePath = __dirname;
    this.cache = new Map();
  }

  /**
   * Get a provider response fixture
   * @param {string} provider - Provider name
   * @param {string} model - Model name (optional)
   * @param {string} scenario - Scenario type (default, streaming, websearch)
   * @returns {Object} Response fixture
   */
  getProviderResponse(provider, model = null, scenario = 'default') {
    const key = `provider-${provider}-${model || 'default'}-${scenario}`;

    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    let response;
    if (scenario === 'streaming') {
      response = fixtures.providerResponses[provider]?.streaming;
    } else if (scenario === 'websearch') {
      response = fixtures.providerResponses[provider]?.websearch;
    } else if (model && fixtures.providerResponses[provider]?.models?.[model]) {
      response = fixtures.providerResponses[provider].models[model];
    } else {
      response = fixtures.providerResponses[provider]?.default;
    }

    if (response) {
      const cloned = JSON.parse(JSON.stringify(response));
      this.cache.set(key, cloned);
      return cloned;
    }

    throw new Error(`No fixture found for ${provider}/${model}/${scenario}`);
  }

  /**
   * Get a tool fixture
   * @param {string} tool - Tool name (chat/consensus)
   * @param {string} scenario - Scenario name
   * @returns {Object} Tool fixture
   */
  getToolFixture(tool, scenario) {
    return fixtures.getToolFixture(tool, scenario);
  }

  /**
   * Get an error scenario
   * @param {string} provider - Provider name or 'validation'/'network'/'mcp'
   * @param {string} errorType - Error type
   * @returns {Object} Error fixture
   */
  getErrorScenario(provider, errorType) {
    return fixtures.getErrorResponse(provider, errorType);
  }

  /**
   * Get an edge case
   * @param {string} category - Category name
   * @param {string} caseName - Case name
   * @returns {*} Edge case value
   */
  getEdgeCase(category, caseName) {
    return fixtures.getEdgeCase(category, caseName);
  }

  /**
   * Load a file fixture
   * @param {string} filename - File name in fixtures/files
   * @returns {string} File content
   */
  loadFile(filename) {
    const filePath = join(this.basePath, 'files', filename);

    if (!existsSync(filePath)) {
      throw new Error(`Fixture file not found: ${filename}`);
    }

    return readFileSync(filePath, 'utf-8');
  }

  /**
   * Get file metadata
   * @param {string} filename - File name
   * @returns {Object} File metadata
   */
  getFileMetadata(filename) {
    const content = this.loadFile(filename);
    const filePath = join(this.basePath, 'files', filename);

    return {
      path: filePath,
      name: filename,
      content,
      size: Buffer.byteLength(content, 'utf-8'),
      lines: content.split('\n').length,
      isEmpty: content.length === 0
    };
  }

  /**
   * Create a mock response with custom content
   * @param {string} provider - Provider name
   * @param {string} model - Model name
   * @param {string} content - Response content
   * @param {Object} options - Additional options
   * @returns {Object} Mock response
   */
  createMockResponse(provider, model, content, options = {}) {
    return fixtures.createMockResponse(provider, model, content, options);
  }

  /**
   * Create streaming chunks
   * @param {string} provider - Provider name
   * @param {string[]} chunks - Text chunks
   * @returns {Array} Streaming response chunks
   */
  createStreamingChunks(provider, chunks) {
    return fixtures.createStreamingResponse(provider, chunks);
  }

  /**
   * Get a complete test scenario
   * @param {string} type - Scenario type
   * @returns {Object} Complete test scenario
   */
  getTestScenario(type) {
    const scenarios = {
      basicChat: {
        tool: 'chat',
        request: this.getToolFixture('chat', 'basic').request,
        response: this.getToolFixture('chat', 'basic').response,
        provider: 'openai',
        model: 'gpt-4o-mini'
      },
      chatWithFiles: {
        tool: 'chat',
        request: this.getToolFixture('chat', 'withFiles').request,
        response: this.getToolFixture('chat', 'withFiles').response,
        files: ['sample.js'],
        provider: 'openai',
        model: 'gpt-4'
      },
      basicConsensus: {
        tool: 'consensus',
        request: this.getToolFixture('consensus', 'basic').request,
        response: this.getToolFixture('consensus', 'basic').response,
        providers: ['openai', 'google', 'xai']
      },
      errorHandling: {
        tool: 'chat',
        request: { prompt: 'Test error handling', model: 'gpt-4' },
        error: this.getErrorScenario('openai', 'rateLimit'),
        expectError: true
      },
      edgeCaseStrings: {
        tool: 'chat',
        testCases: Object.entries(fixtures.edgeCases.strings).map(([name, value]) => ({
          name,
          value,
          request: { prompt: value, model: 'gpt-3.5-turbo' }
        }))
      }
    };

    if (!scenarios[type]) {
      throw new Error(`Unknown test scenario: ${type}`);
    }

    return scenarios[type];
  }

  /**
   * Get all available fixtures of a type
   * @param {string} type - Fixture type
   * @returns {string[]} Available fixture names
   */
  listFixtures(type) {
    switch (type) {
    case 'providers':
      return Object.keys(fixtures.providerResponses);
    case 'tools':
      return Object.keys(fixtures.toolFixtures);
    case 'errors':
      return Object.keys(fixtures.errorScenarios);
    case 'edgeCases':
      return Object.keys(fixtures.edgeCases);
    case 'files':
      return Object.keys(fixtures.FIXTURE_PATHS).filter(k => k !== 'responses');
    default:
      throw new Error(`Unknown fixture type: ${type}`);
    }
  }

  /**
   * Clear the cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Generate a test matrix
   * @param {Object} options - Matrix options
   * @returns {Array} Test matrix
   */
  generateTestMatrix(options = {}) {
    return fixtures.createTestMatrix(options);
  }
}

// Create singleton instance
export const fixtureLoader = new FixtureLoader();

// Export convenience functions
export const {
  getProviderResponse,
  getToolFixture,
  getErrorScenario,
  getEdgeCase,
  loadFile,
  getFileMetadata,
  createMockResponse,
  createStreamingChunks,
  getTestScenario,
  listFixtures,
  generateTestMatrix
} = Object.fromEntries(
  Object.getOwnPropertyNames(FixtureLoader.prototype)
    .filter(name => name !== 'constructor' && name !== 'clearCache')
    .map(name => [name, fixtureLoader[name].bind(fixtureLoader)])
);

// Export the loader class for extension
export default FixtureLoader;
