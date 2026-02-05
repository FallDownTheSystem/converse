/**
 * Tests for API key detection utilities with invalid key values.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import apiKeyDetection from './apiKeyDetection.js';

const { hasApiKey } = apiKeyDetection;

describe('API Key Detection - Invalid Keys', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('treats an invalid OpenAI key prefix as unavailable', () => {
    process.env.OPENAI_API_KEY = 'not-sk-but-long-enough-to-look-real-12345';
    expect(hasApiKey('OPENAI')).toBe(false);
  });

  it('treats a too-short Google key as unavailable', () => {
    process.env.GOOGLE_API_KEY = 'short';
    expect(hasApiKey('GOOGLE')).toBe(false);
  });

  it('treats a too-short GEMINI_API_KEY as unavailable for Google', () => {
    delete process.env.GOOGLE_API_KEY;
    process.env.GEMINI_API_KEY = 'short';

    expect(hasApiKey('GOOGLE')).toBe(false);
  });

  it('treats a valid-looking OpenAI key as available', () => {
    process.env.OPENAI_API_KEY = 'sk-123456789012345678901234567890';
    expect(hasApiKey('OPENAI')).toBe(true);
  });
});

