/**
 * Tests for Help Resource
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  helpResourceHandler,
  helpResourceMetadata,
  listResources,
} from '../../src/resources/helpResource.js';

describe('Help Resource', () => {
  describe('helpResourceMetadata', () => {
    it('should have correct metadata', () => {
      expect(helpResourceMetadata).toEqual({
        uri: 'converse://help',
        name: 'Help Documentation',
        description:
          'Comprehensive guide for the Converse MCP Server including all tools, parameters, providers, and models',
        mimeType: 'text/plain',
      });
    });
  });

  describe('listResources', () => {
    it('should return array with help resource metadata', () => {
      const resources = listResources();
      expect(resources).toHaveLength(1);
      expect(resources[0]).toEqual(helpResourceMetadata);
    });
  });

  describe('helpResourceHandler', () => {
    it('should return resource content with correct structure', async () => {
      const result = await helpResourceHandler();

      expect(result).toHaveProperty('contents');
      expect(result.contents).toBeInstanceOf(Array);
      expect(result.contents).toHaveLength(1);

      const content = result.contents[0];
      expect(content).toHaveProperty('uri', 'converse://help');
      expect(content).toHaveProperty('mimeType', 'text/plain');
      expect(content).toHaveProperty('text');
    });

    it('should include help documentation content', async () => {
      const result = await helpResourceHandler();
      const content = result.contents[0].text;

      // Check for main sections
      expect(content).toContain('# Converse MCP Server - Comprehensive Guide');
      expect(content).toContain('## Available Tools');
      expect(content).toContain('### 1. Chat Tool');
      expect(content).toContain('### 2. Consensus Tool');
      expect(content).toContain('## Provider Models');
      expect(content).toContain('### OPENAI Models');
      expect(content).toContain('### GOOGLE GEMINI Models');
      expect(content).toContain('### X.AI (GROK) Models');
    });

    it('should include version information', async () => {
      const result = await helpResourceHandler();
      const content = result.contents[0].text;

      // Check for server information section
      expect(content).toContain('## Server Information');
      expect(content).toContain('- **Version**:');
      expect(content).toContain('- **Protocol**: MCP (Model Context Protocol)');
      expect(content).toContain('- **Server Type**: HTTP Transport');
      expect(content).toContain('- **Default Port**: 3157');
    });

    it('should include model details with descriptions', async () => {
      const result = await helpResourceHandler();
      const content = result.contents[0].text;

      // Check for specific model information
      expect(content).toContain('**o3** - OpenAI (O3)');
      expect(content).toContain('Strong reasoning (200K context)');
      expect(content).toContain('**gemini-2.5-flash** - Gemini (Flash 2.5)');
      expect(content).toContain('Ultra-fast (1M context)');
      expect(content).toContain('**grok-4-0709** - X.AI (Grok 4)');
      expect(content).toContain('GROK-4 (256K context)');
    });

    it('should include configuration and best practices', async () => {
      const result = await helpResourceHandler();
      const content = result.contents[0].text;

      // Check for configuration sections
      expect(content).toContain('## Configuration Tips');
      expect(content).toContain('### Temperature Settings');
      expect(content).toContain('### Reasoning Effort');
      expect(content).toContain('## Best Practices');
      expect(content).toContain('## Environment Variables');
    });
  });
});
