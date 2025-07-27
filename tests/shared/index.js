/**
 * Comprehensive shared test utilities
 * Central export point for all test helpers, mocks, and fixtures
 */

// Export all mock utilities
export * from './mocks/providers/index.js';
export * from './mocks/tools/index.js';

// Export all helper utilities
export * from './helpers/index.js';

// Export all fixtures
export * from './fixtures/index.js';

// Import modules for default exports
import * as mockProviders from './mocks/providers/index.js';
import * as mockTools from './mocks/tools/index.js';
import helpers from './helpers/index.js';
import fixtures from './fixtures/index.js';

// Create comprehensive test utilities object
export const testUtils = {
  mocks: {
    providers: mockProviders,
    tools: mockTools
  },
  helpers,
  fixtures,
  
  /**
   * Quick access to commonly used utilities
   */
  createMockProvider: mockProviders.createMockProvider,
  createMockTool: mockTools.createMockTool,
  createMockConfig: helpers.config.createMockConfig,
  createMockLogger: helpers.logging.createMockLogger,
  waitFor: helpers.async.waitFor,
  getFixturePath: helpers.paths.getFixturePath
};

// Export default for convenient importing
export default testUtils;