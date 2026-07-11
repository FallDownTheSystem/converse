/**
 * Tests for the help prompt
 */

import { describe, it, expect } from 'vitest';
import {
  helpPromptHandler,
  helpPromptMetadata,
} from '../../src/prompts/helpPrompt.js';

describe('Help Prompt', () => {
  it('should have correct metadata', () => {
    expect(helpPromptMetadata.name).toBe('help');
    expect(typeof helpPromptMetadata.description).toBe('string');
    expect(Array.isArray(helpPromptMetadata.arguments)).toBe(true);
    expect(typeof helpPromptHandler).toBe('function');
  });

  describe('helpPromptHandler', () => {
    it('should generate full help content', async () => {
      const result = await helpPromptHandler({});
      const messages = result.messages;

      expect(Array.isArray(messages)).toBe(true);
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content.type).toBe('text');
      expect(messages[0].content.text).toContain('Converse MCP Server');
      expect(messages[0].content.text).toContain('Available Tools');
      expect(messages[0].content.text).toContain('Provider Models');
      expect(messages[0].content.text).toContain('Example Usage');
    });

    it('documents modes and omits removed Temperature/Verbosity sections', async () => {
      const result = await helpPromptHandler({});
      const text = result.messages[0].content.text;

      expect(text).toContain('### Modes');
      expect(text).toContain('mode "consensus"');
      expect(text).not.toContain('### Temperature Settings');
      expect(text).not.toContain('### Verbosity');
    });
  });

  describe('Dynamic content generation', () => {
    it('should include real model information from providers', async () => {
      const result = await helpPromptHandler({});
      const messages = result.messages;
      const content = messages[0].content.text;

      // Check for some known models
      expect(content).toMatch(/o3[\s\S]*Strong reasoning/);
      expect(content).toMatch(/gemini[\s\S]*context/);
      expect(content).toMatch(/grok[\s\S]*X\.AI/);
    });

    it('should include model aliases', async () => {
      const result = await helpPromptHandler({});
      const messages = result.messages;
      const content = messages[0].content.text;

      // Check for some known aliases
      expect(content).toContain('Aliases:');
      expect(content).toMatch(/o4mini|o4 mini/);
      expect(content).toMatch(/flash|gemini-flash/);
    });

    it('should include model features', async () => {
      const result = await helpPromptHandler({});
      const messages = result.messages;
      const content = messages[0].content.text;

      // Check for features
      expect(content).toContain('Features:');
      expect(content).toContain('Streaming');
      expect(content).toContain('Images');
      expect(content).toContain('Web Search');
    });
  });
});
