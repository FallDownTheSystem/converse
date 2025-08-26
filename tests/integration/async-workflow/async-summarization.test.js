/**
 * Integration tests for async chat with summarization enabled
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { withHTTPTestServer } from '../../utils/HTTPMCPServerManager.js';
import { loadConfig } from '../../../src/config.js';
import { createLogger } from '../../../src/utils/logger.js';
import { testWithApiKeys } from '../../utils/conditionalTest.js';
import { parseStatusResponse } from '../../utils/responseParser.js';

const logger = createLogger('async-summarization-test');

describe('Async Chat with Summarization Enabled', () => {
  let config;

  beforeAll(async () => {
    // Enable summarization for these tests
    process.env.ENABLE_RESPONSE_SUMMARIZATION = 'true';
    process.env.SUMMARIZATION_MODEL = 'gpt-5-nano';
    
    config = await loadConfig();
    
    // Verify summarization is enabled
    expect(config.summarization?.enabled).toBe(true);
    logger.info(`Summarization enabled with model: ${config.summarization.model}`);
  });

  testWithApiKeys({
    requiredProviders: ['OPENAI'],
    requireAll: true
  })('should generate title and summaries during async chat', async () => {
    await withHTTPTestServer(async (client, manager) => {
      // Start async chat request
      const asyncResult = await client.callTool({
        name: 'chat',
        arguments: {
          prompt: 'What is recursion in programming? Give a simple Python example.',
          model: 'gpt-5-nano',
          async: true
        }
      });

      expect(asyncResult.isError).toBeFalsy();
      expect(asyncResult.continuation?.id).toBeTruthy();
      
      const continuationId = asyncResult.continuation.id;
      logger.info(`Started async job: ${continuationId}`);

      // Poll for completion and track summarization features
      let completed = false;
      let finalStatus = null;
      let titleSeen = false;
      let accumulatedContentSeen = false;
      let finalSummarySeen = false;
      
      const startTime = Date.now();
      const maxWaitTime = 30000; // 30 seconds

      while (!completed && (Date.now() - startTime < maxWaitTime)) {
        await new Promise(resolve => setTimeout(resolve, 1000));

        const statusResult = await client.callTool({
          name: 'check_status',
          arguments: {
            continuation_id: continuationId
          }
        });

        expect(statusResult.isError).toBeFalsy();
        
        // Parse the status response
        const statusText = statusResult.content[0].text;
        const status = parseStatusResponse(statusText);
        
        // Track summarization features as they appear
        if (status.title && !titleSeen) {
          titleSeen = true;
          logger.info(`✅ Title generated: "${status.title}"`);
          expect(status.title.length).toBeGreaterThan(5);
          expect(status.title.length).toBeLessThanOrEqual(60);
        }
        
        if (status.accumulated_content && !accumulatedContentSeen) {
          accumulatedContentSeen = true;
          logger.info(`✅ Accumulated content: ${status.accumulated_content.length} chars`);
          expect(status.accumulated_content.length).toBeGreaterThan(0);
        }
        
        if (status.status === 'completed') {
          completed = true;
          finalStatus = status;
          
          if (status.final_summary && !finalSummarySeen) {
            finalSummarySeen = true;
            logger.info(`✅ Final summary: "${status.final_summary}"`);
            expect(status.final_summary.length).toBeGreaterThan(20);
            expect(status.final_summary.length).toBeLessThanOrEqual(250);
          }
        } else if (status.status === 'failed') {
          throw new Error(`Job failed: ${status.error}`);
        }
      }

      // Verify completion and summarization features
      expect(completed).toBe(true);
      expect(titleSeen).toBe(true);
      expect(accumulatedContentSeen).toBe(true);
      expect(finalSummarySeen).toBe(true);
      
      // Verify the actual response exists
      expect(finalStatus?.result?.content).toBeTruthy();
      expect(finalStatus.result.content.toLowerCase()).toContain('recursion');
      
      logger.info('All summarization features verified successfully');
    });
  }, 60000);

  testWithApiKeys({
    requiredProviders: ['OPENAI'],
    requireAll: true
  })('should use minimal reasoning for fast summarization', async () => {
    await withHTTPTestServer(async (client, manager) => {
      const startTime = Date.now();
      
      // Quick request to test speed
      const asyncResult = await client.callTool({
        name: 'chat',
        arguments: {
          prompt: 'What is 2+2?',
          model: 'gpt-5-nano',
          async: true
        }
      });

      const continuationId = asyncResult.continuation.id;
      
      // Track timing
      let titleGenerationTime = null;
      let completionTime = null;
      let completed = false;

      while (!completed && (Date.now() - startTime < 15000)) {
        await new Promise(resolve => setTimeout(resolve, 500));

        const statusResult = await client.callTool({
          name: 'check_status',
          arguments: { continuation_id: continuationId }
        });

        const statusText = statusResult.content[0].text;
        const status = parseStatusResponse(statusText);
        
        // Track when title appears
        if (status.title && !titleGenerationTime) {
          titleGenerationTime = Date.now() - startTime;
          logger.info(`Title generated in ${titleGenerationTime}ms`);
          expect(titleGenerationTime).toBeLessThan(5000); // Should be fast
        }
        
        if (status.status === 'completed') {
          completed = true;
          completionTime = Date.now() - startTime;
          logger.info(`Total completion in ${completionTime}ms`);
          expect(completionTime).toBeLessThan(15000); // Should complete quickly
          
          // Verify concise summary for simple question
          if (status.final_summary) {
            expect(status.final_summary.length).toBeLessThan(100);
          }
        }
      }

      expect(completed).toBe(true);
    });
  }, 30000);

  testWithApiKeys({
    requiredProviders: ['GOOGLE'],
    requireAll: true
  })('should work with Gemini models', async () => {
    await withHTTPTestServer(async (client, manager) => {
      const asyncResult = await client.callTool({
        name: 'chat',
        arguments: {
          prompt: 'Describe a sunset in one sentence.',
          model: 'gemini-2.5-flash',
          async: true
        }
      });

      const continuationId = asyncResult.continuation.id;
      logger.info(`Started Gemini async job: ${continuationId}`);

      let completed = false;
      let finalStatus = null;
      const startTime = Date.now();

      while (!completed && (Date.now() - startTime < 30000)) {
        await new Promise(resolve => setTimeout(resolve, 1000));

        const statusResult = await client.callTool({
          name: 'check_status',
          arguments: { continuation_id: continuationId }
        });

        const status = parseStatusResponse(statusResult.content[0].text);
        
        if (status.title) {
          logger.info(`Gemini title: "${status.title}"`);
        }
        
        if (status.status === 'completed') {
          completed = true;
          finalStatus = status;
          
          if (status.final_summary) {
            logger.info(`Gemini summary: "${status.final_summary}"`);
          }
        }
      }

      expect(completed).toBe(true);
      expect(finalStatus?.title).toBeTruthy();
      expect(finalStatus?.accumulated_content).toBeTruthy();
    });
  }, 60000);
});