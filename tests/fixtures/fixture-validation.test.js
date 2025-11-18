/**
 * Fixture Validation Tests
 * Ensures all fixtures are valid and properly structured
 */

import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { fixtureLoader } from './loader.js';
import fixtures from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Fixture Validation', () => {
  describe('Provider Response Fixtures', () => {
    const providers = Object.keys(fixtures.providerResponses);

    providers.forEach((provider) => {
      describe(`${provider} provider`, () => {
        it('should have a default response', () => {
          const defaultResponse = fixtures.providerResponses[provider].default;
          expect(defaultResponse).toBeDefined();
        });

        it('should have valid response structure', () => {
          const response = fixtureLoader.getProviderResponse(provider);

          // Check common fields based on provider type
          if (
            ['openai', 'xai', 'openrouter', 'deepseek', 'mistral'].includes(
              provider,
            )
          ) {
            expect(response).toHaveProperty('id');
            expect(response).toHaveProperty('choices');
            expect(Array.isArray(response.choices)).toBe(true);
            expect(response.choices[0]).toHaveProperty('message');
            expect(response.choices[0].message).toHaveProperty('content');
          } else if (provider === 'google') {
            expect(response).toHaveProperty('candidates');
            expect(Array.isArray(response.candidates)).toBe(true);
            expect(response.candidates[0]).toHaveProperty('content');
            expect(response.candidates[0].content).toHaveProperty('parts');
          } else if (provider === 'anthropic') {
            expect(response).toHaveProperty('content');
            expect(Array.isArray(response.content)).toBe(true);
            expect(response.content[0]).toHaveProperty('text');
          }
        });

        if (fixtures.providerResponses[provider].models) {
          const models = Object.keys(
            fixtures.providerResponses[provider].models,
          );

          models.forEach((model) => {
            it(`should have valid response for ${model}`, () => {
              const response = fixtureLoader.getProviderResponse(
                provider,
                model,
              );
              expect(response).toBeDefined();

              // Basic structure validation
              if (provider !== 'google' && provider !== 'anthropic') {
                expect(response.model).toBe(model);
              }
            });
          });
        }

        if (fixtures.providerResponses[provider].streaming) {
          it('should have valid streaming response structure', () => {
            const chunks = fixtureLoader.createStreamingChunks(provider, [
              'test',
            ]);
            expect(Array.isArray(chunks)).toBe(true);
            expect(chunks.length).toBeGreaterThan(0);
          });
        }
      });
    });
  });

  describe('Tool Fixtures', () => {
    const tools = Object.keys(fixtures.toolFixtures);

    tools.forEach((tool) => {
      const scenarios = Object.keys(fixtures.toolFixtures[tool]);

      scenarios.forEach((scenario) => {
        it(`${tool}/${scenario} should have valid structure`, () => {
          const fixture = fixtureLoader.getToolFixture(tool, scenario);

          if (fixture.request) {
            expect(fixture.request).toHaveProperty('prompt');

            if (tool === 'consensus') {
              expect(fixture.request).toHaveProperty('models');
              expect(Array.isArray(fixture.request.models)).toBe(true);
            } else {
              expect(fixture.request).toHaveProperty('model');
            }
          }

          if (fixture.response) {
            expect(fixture.response).toBeDefined();
          }
        });
      });
    });
  });

  describe('Error Scenarios', () => {
    const categories = Object.keys(fixtures.errorScenarios);

    categories.forEach((category) => {
      const errorTypes = Object.keys(fixtures.errorScenarios[category]);

      errorTypes.forEach((errorType) => {
        it(`${category}/${errorType} should have valid error structure`, () => {
          const error = fixtureLoader.getErrorScenario(category, errorType);
          expect(error).toBeDefined();

          // Validate error has some error indication
          const hasError =
            error.error ||
            error.message ||
            error.code ||
            error.type ||
            error.candidates?.[0]?.finishReason === 'SAFETY';

          expect(hasError).toBeTruthy();
        });
      });
    });
  });

  describe('Edge Cases', () => {
    const categories = Object.keys(fixtures.edgeCases);

    categories.forEach((category) => {
      it(`${category} edge cases should be defined`, () => {
        const cases = fixtures.edgeCases[category];
        expect(cases).toBeDefined();
        expect(Object.keys(cases).length).toBeGreaterThan(0);
      });
    });

    it('should handle special string edge cases', () => {
      const emptyString = fixtureLoader.getEdgeCase('strings', 'empty');
      expect(emptyString).toBe('');

      const unicode = fixtureLoader.getEdgeCase('strings', 'unicode');
      expect(typeof unicode).toBe('string');
      expect(unicode.length).toBeGreaterThan(0);
    });

    it('should handle number edge cases', () => {
      const zero = fixtureLoader.getEdgeCase('numbers', 'zero');
      expect(zero).toBe(0);

      const infinity = fixtureLoader.getEdgeCase('numbers', 'infinity');
      expect(infinity).toBe('Infinity');
    });
  });

  describe('File Fixtures', () => {
    const fileFixtures = [
      'sample.txt',
      'sample.js',
      'sample.py',
      'sample.ts',
      'sample.json',
      'nested.json',
      'large.json',
      'large-text.txt',
      'unicode-text.txt',
      'special-chars.txt',
      'empty.txt',
    ];

    fileFixtures.forEach((filename) => {
      it(`${filename} should exist and be loadable`, () => {
        const filePath = join(__dirname, 'files', filename);
        expect(existsSync(filePath)).toBe(true);

        const content = fixtureLoader.loadFile(filename);
        expect(content).toBeDefined();

        const metadata = fixtureLoader.getFileMetadata(filename);
        expect(metadata.name).toBe(filename);
        expect(metadata.size).toBeGreaterThanOrEqual(0);
        expect(metadata.lines).toBeGreaterThanOrEqual(0);
      });
    });

    it('should handle empty file correctly', () => {
      const metadata = fixtureLoader.getFileMetadata('empty.txt');
      expect(metadata.isEmpty).toBe(true);
      expect(metadata.content).toBe('');
    });

    it('should load JSON files as valid JSON', () => {
      const jsonFiles = ['sample.json', 'nested.json', 'large.json'];

      jsonFiles.forEach((filename) => {
        const content = fixtureLoader.loadFile(filename);
        expect(() => JSON.parse(content)).not.toThrow();
      });
    });
  });

  describe('Fixture Loader Functions', () => {
    it('should create valid mock responses', () => {
      const providers = ['openai', 'google', 'xai', 'anthropic'];

      providers.forEach((provider) => {
        const response = fixtureLoader.createMockResponse(
          provider,
          provider === 'openai'
            ? 'gpt-4'
            : provider === 'google'
              ? 'gemini-2.5-pro'
              : provider === 'xai'
                ? 'grok-4'
                : 'claude-3-5-sonnet-20241022',
          'Test content',
        );

        expect(response).toBeDefined();

        // Verify content was updated
        let content;
        if (provider === 'google') {
          content = response.candidates[0].content.parts[0].text;
        } else if (provider === 'anthropic') {
          content = response.content[0].text;
        } else {
          content = response.choices[0].message.content;
        }

        expect(content).toBe('Test content');
      });
    });

    it('should generate valid test matrix', () => {
      const matrix = fixtureLoader.generateTestMatrix({
        providers: ['openai', 'google'],
        models: {
          openai: ['gpt-4'],
          google: ['gemini-2.5-pro'],
        },
        scenarios: ['success', 'error'],
      });

      expect(Array.isArray(matrix)).toBe(true);
      expect(matrix.length).toBe(4); // 2 providers * 1 model each * 2 scenarios

      matrix.forEach((item) => {
        expect(item).toHaveProperty('provider');
        expect(item).toHaveProperty('model');
        expect(item).toHaveProperty('scenario');
        expect(item).toHaveProperty('key');
      });
    });

    it('should list fixtures correctly', () => {
      const providers = fixtureLoader.listFixtures('providers');
      expect(Array.isArray(providers)).toBe(true);
      expect(providers.length).toBeGreaterThan(0);

      const tools = fixtureLoader.listFixtures('tools');
      expect(tools).toContain('chat');
      expect(tools).toContain('consensus');
    });

    it('should cache fixtures properly', () => {
      fixtureLoader.clearCache();

      // First call should cache
      const response1 = fixtureLoader.getProviderResponse('openai', 'gpt-4');

      // Second call should return cached version
      const response2 = fixtureLoader.getProviderResponse('openai', 'gpt-4');

      // They should be the same object (cached)
      expect(response1).toBe(response2);

      // Clear cache and get new instance
      fixtureLoader.clearCache();
      const response3 = fixtureLoader.getProviderResponse('openai', 'gpt-4');

      // Should be different object but same content
      expect(response3).not.toBe(response1);
      expect(response3).toEqual(response1);
    });
  });

  describe('Test Scenarios', () => {
    const scenarios = [
      'basicChat',
      'chatWithFiles',
      'basicConsensus',
      'errorHandling',
    ];

    scenarios.forEach((scenario) => {
      it(`should provide valid ${scenario} test scenario`, () => {
        const testScenario = fixtureLoader.getTestScenario(scenario);
        expect(testScenario).toBeDefined();
        expect(testScenario.tool).toBeDefined();

        if (testScenario.request) {
          expect(testScenario.request).toBeDefined();
        }

        if (testScenario.expectError) {
          expect(testScenario.error).toBeDefined();
        } else if (testScenario.response) {
          expect(testScenario.response).toBeDefined();
        }
      });
    });
  });
});

describe('Fixture Consistency', () => {
  it('all provider responses should have consistent usage fields', () => {
    const providers = Object.keys(fixtures.providerResponses);

    providers.forEach((provider) => {
      const response = fixtureLoader.getProviderResponse(provider);

      // Check for usage information
      if (provider === 'google') {
        expect(response).toHaveProperty('usageMetadata');
        expect(response.usageMetadata).toHaveProperty('totalTokenCount');
      } else if (provider === 'anthropic') {
        expect(response).toHaveProperty('usage');
        expect(response.usage).toHaveProperty('input_tokens');
        expect(response.usage).toHaveProperty('output_tokens');
      } else {
        expect(response).toHaveProperty('usage');
        expect(response.usage).toHaveProperty('total_tokens');
      }
    });
  });

  it('all tool fixtures should have consistent metadata', () => {
    const chatFixtures = Object.keys(fixtures.toolFixtures.chat);

    chatFixtures.forEach((scenario) => {
      const fixture = fixtureLoader.getToolFixture('chat', scenario);

      if (fixture.response && fixture.response.metadata) {
        expect(fixture.response.metadata).toHaveProperty('model');
        expect(fixture.response.metadata).toHaveProperty('provider');
      }
    });
  });
});
