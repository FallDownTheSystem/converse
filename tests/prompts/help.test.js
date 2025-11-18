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

  it('should have topic argument', () => {
    const topicArg = helpPromptMetadata.arguments.find(
      (arg) => arg.name === 'topic',
    );
    expect(topicArg).toBeTruthy();
    expect(topicArg.required).toBe(false);
    expect(topicArg.description).toContain('topic');
  });

  describe('helpPromptHandler', () => {
    it('should generate full help when no topic specified', async () => {
      const result = await helpPromptHandler({});
      const messages = result.messages;

      expect(Array.isArray(messages)).toBe(true);
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content.type).toBe('text');
      expect(messages[0].content.text).toContain('Converse MCP Server');
      expect(messages[0].content.text).toContain('Available Tools');
      expect(messages[0].content.text).toContain('Provider Models');
    });

    it('should generate tools help when topic is tools', async () => {
      const result = await helpPromptHandler({ topic: 'tools' });
      const messages = result.messages;

      expect(Array.isArray(messages)).toBe(true);
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content.type).toBe('text');
      expect(messages[0].content.text).toContain('tools');
      expect(messages[0].content.text).toContain('Available Tools');
    });

    it('should generate models help when topic is models', async () => {
      const result = await helpPromptHandler({ topic: 'models' });
      const messages = result.messages;

      expect(Array.isArray(messages)).toBe(true);
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content.type).toBe('text');
      expect(messages[0].content.text).toContain('models');
      expect(messages[0].content.text).toContain('Provider Models');
    });

    it('should generate parameters help when topic is parameters', async () => {
      const result = await helpPromptHandler({ topic: 'parameters' });
      const messages = result.messages;

      expect(Array.isArray(messages)).toBe(true);
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content.type).toBe('text');
      expect(messages[0].content.text).toContain('parameters');
      expect(messages[0].content.text).toContain('Configuration Tips');
    });

    it('should generate examples help when topic is examples', async () => {
      const result = await helpPromptHandler({ topic: 'examples' });
      const messages = result.messages;

      expect(Array.isArray(messages)).toBe(true);
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content.type).toBe('text');
      expect(messages[0].content.text).toContain('examples');
      expect(messages[0].content.text).toContain('Example Usage');
    });

    it('should handle unknown topic gracefully', async () => {
      const result = await helpPromptHandler({ topic: 'unknown' });
      const messages = result.messages;

      expect(Array.isArray(messages)).toBe(true);
      expect(messages).toHaveLength(1);
      expect(messages[0].content.type).toBe('text');
      expect(messages[0].content.text).toContain('Topic "unknown" not found');
      expect(messages[0].content.text).toContain('Available topics');
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
      expect(content).toMatch(/o3mini|o3 mini/);
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
