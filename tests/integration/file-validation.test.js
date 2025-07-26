import { describe, it, expect, beforeEach, vi } from 'vitest';
import { chatTool } from '../../src/tools/chat.js';
import { consensusTool } from '../../src/tools/consensus.js';
import { HTTPMCPServerManager, withHTTPTestServer } from '../utils/HTTPMCPServerManager.js';
import { logger } from '../../src/utils/logger.js';

describe('File Validation Integration Tests', () => {
  describe('Chat Tool File Validation', () => {
    it('should return error when files do not exist', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Analyze these files',
            files: ['nonexistent-file-1.txt', 'nonexistent-file-2.txt']
          }
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Files not found: nonexistent-file-1.txt, nonexistent-file-2.txt');

        logger.info('[file-validation-test] Chat tool correctly rejected missing files');
      });
    });

    it('should return error when images do not exist', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Describe these images',
            images: ['missing-image-1.png', 'missing-image-2.jpg']
          }
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Images not found: missing-image-1.png, missing-image-2.jpg');

        logger.info('[file-validation-test] Chat tool correctly rejected missing images');
      });
    });

    it('should return error when both files and images do not exist', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Analyze these resources',
            files: ['missing.txt'],
            images: ['missing.png']
          }
        });

        expect(result.isError).toBe(true);
        const errorText = result.content[0].text;
        expect(errorText).toContain('Files not found: missing.txt');
        expect(errorText).toContain('Images not found: missing.png');

        logger.info('[file-validation-test] Chat tool correctly rejected missing files and images');
      });
    });

    it('should work normally when all files exist', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'What is the name and version in package.json?',
            files: ['package.json']
          }
        });

        expect(result.isError).toBe(false);
        expect(result.content[0].text).toBeDefined();

        logger.info('[file-validation-test] Chat tool processed existing file successfully');
      });
    });

    it('should handle mix of existing and non-existing files', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Analyze these files',
            files: ['package.json', 'nonexistent.txt', 'README.md', 'missing.md']
          }
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Files not found: nonexistent.txt, missing.md');

        logger.info('[file-validation-test] Chat tool correctly rejected mix of existing and missing files');
      });
    });
  });

  describe('Consensus Tool File Validation', () => {
    it('should return error when files do not exist', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'consensus',
          arguments: {
            prompt: 'Analyze these files',
            models: [{ model: 'gpt-4o-mini' }],
            files: ['nonexistent-1.txt', 'nonexistent-2.txt']
          }
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Files not found: nonexistent-1.txt, nonexistent-2.txt');

        logger.info('[file-validation-test] Consensus tool correctly rejected missing files');
      });
    });

    it('should return error when images do not exist', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'consensus',
          arguments: {
            prompt: 'Describe these images',
            models: [{ model: 'gpt-4o-mini' }],
            images: ['missing-consensus-1.png', 'missing-consensus-2.jpg']
          }
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Images not found: missing-consensus-1.png, missing-consensus-2.jpg');

        logger.info('[file-validation-test] Consensus tool correctly rejected missing images');
      });
    });

    it('should work normally when all files exist', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const result = await client.callTool({
          name: 'consensus',
          arguments: {
            prompt: 'What type of project is this based on package.json?',
            models: [{ model: 'gpt-4o-mini' }],
            files: ['package.json']
          }
        });

        expect(result.isError).toBe(false);
        expect(result.content[0].text).toBeDefined();

        logger.info('[file-validation-test] Consensus tool processed existing file successfully');
      });
    });
  });

  describe('Path Resolution', () => {
    it('should handle absolute paths correctly', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const absolutePath = 'C:\\Windows\\System32\\nonexistent-file.txt';
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Read this file',
            files: [absolutePath]
          }
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain(absolutePath);

        logger.info('[file-validation-test] Correctly handled absolute path validation');
      });
    });

    it('should handle relative paths correctly', async () => {
      await withHTTPTestServer(async (client, manager) => {
        const relativePaths = ['./missing.txt', '../parent/missing.txt', 'subdir/missing.txt'];
        const result = await client.callTool({
          name: 'chat',
          arguments: {
            prompt: 'Read these files',
            files: relativePaths
          }
        });

        expect(result.isError).toBe(true);
        // Original paths should be preserved in error message
        relativePaths.forEach(path => {
          expect(result.content[0].text).toContain(path);
        });

        logger.info('[file-validation-test] Correctly handled relative path validation');
      });
    });
  });
});
