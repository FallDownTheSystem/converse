/**
 * Unit tests for Codex configuration
 * Tests config schema loading, validation, and default values
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../../src/config.js';

describe('Codex Configuration', () => {
  // Store original env vars
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Clear Codex-related env vars
    delete process.env.CODEX_SANDBOX_MODE;
    delete process.env.CODEX_SKIP_GIT_CHECK;
    delete process.env.CODEX_APPROVAL_POLICY;
    delete process.env.CODEX_DEFAULT_MODEL;
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('Default Values', () => {
    it('should load default values when env vars not set', async () => {
      const config = await loadConfig();

      expect(config.providers.codexapikey).toBeUndefined();
      expect(config.providers.codexsandboxmode).toBe('read-only');
      expect(config.providers.codexskipgitcheck).toBe(true);
      expect(config.providers.codexapprovalpolicy).toBe('never');
      expect(config.providers.codexdefaultmodel).toBe('gpt-5-codex');
    });
  });

  describe('Sandbox Mode Validation', () => {
    it('should accept valid sandbox mode: read-only', async () => {
      process.env.CODEX_SANDBOX_MODE = 'read-only';
      const config = await loadConfig();

      expect(config.providers.codexsandboxmode).toBe('read-only');
    });

    it('should accept valid sandbox mode: workspace-write', async () => {
      process.env.CODEX_SANDBOX_MODE = 'workspace-write';
      const config = await loadConfig();

      expect(config.providers.codexsandboxmode).toBe('workspace-write');
    });

    it('should accept valid sandbox mode: danger-full-access', async () => {
      process.env.CODEX_SANDBOX_MODE = 'danger-full-access';
      const config = await loadConfig();

      expect(config.providers.codexsandboxmode).toBe('danger-full-access');
    });

    it('should throw error for invalid sandbox mode', async () => {
      process.env.CODEX_SANDBOX_MODE = 'invalid-mode';

      await expect(loadConfig()).rejects.toThrow(/Invalid CODEX_SANDBOX_MODE/);
    });
  });

  describe('Approval Policy Validation', () => {
    it('should accept valid approval policy: never', async () => {
      process.env.CODEX_APPROVAL_POLICY = 'never';
      const config = await loadConfig();

      expect(config.providers.codexapprovalpolicy).toBe('never');
    });

    it('should accept valid approval policy: untrusted', async () => {
      process.env.CODEX_APPROVAL_POLICY = 'untrusted';
      const config = await loadConfig();

      expect(config.providers.codexapprovalpolicy).toBe('untrusted');
    });

    it('should accept valid approval policy: on-failure', async () => {
      process.env.CODEX_APPROVAL_POLICY = 'on-failure';
      const config = await loadConfig();

      expect(config.providers.codexapprovalpolicy).toBe('on-failure');
    });

    it('should accept valid approval policy: on-request', async () => {
      process.env.CODEX_APPROVAL_POLICY = 'on-request';
      const config = await loadConfig();

      expect(config.providers.codexapprovalpolicy).toBe('on-request');
    });

    it('should throw error for invalid approval policy', async () => {
      process.env.CODEX_APPROVAL_POLICY = 'invalid-policy';

      await expect(loadConfig()).rejects.toThrow(
        /Invalid CODEX_APPROVAL_POLICY/,
      );
    });
  });

  describe('Boolean False Preservation', () => {
    it('should preserve CODEX_SKIP_GIT_CHECK=false in config', async () => {
      process.env.CODEX_SKIP_GIT_CHECK = 'false';
      const config = await loadConfig();

      // CRITICAL TEST: Verifies the boolean config loader fix
      expect(config.providers.codexskipgitcheck).toBe(false);
      expect(config.providers.codexskipgitcheck).not.toBeUndefined();
    });

    it('should parse CODEX_SKIP_GIT_CHECK=true correctly', async () => {
      process.env.CODEX_SKIP_GIT_CHECK = 'true';
      const config = await loadConfig();

      expect(config.providers.codexskipgitcheck).toBe(true);
    });

    it('should handle CODEX_SKIP_GIT_CHECK=0 as false', async () => {
      process.env.CODEX_SKIP_GIT_CHECK = '0';
      const config = await loadConfig();

      expect(config.providers.codexskipgitcheck).toBe(false);
    });

    it('should handle CODEX_SKIP_GIT_CHECK=1 as true', async () => {
      process.env.CODEX_SKIP_GIT_CHECK = '1';
      const config = await loadConfig();

      expect(config.providers.codexskipgitcheck).toBe(true);
    });
  });

  describe('Default Model Configuration', () => {
    it('should use default model when not specified', async () => {
      const config = await loadConfig();

      expect(config.providers.codexdefaultmodel).toBe('gpt-5-codex');
    });

    it('should accept custom default model', async () => {
      process.env.CODEX_DEFAULT_MODEL = 'o3-codex';
      const config = await loadConfig();

      expect(config.providers.codexdefaultmodel).toBe('o3-codex');
    });
  });

  describe('Combined Configuration', () => {
    it('should load all Codex config values together', async () => {
      process.env.CODEX_SANDBOX_MODE = 'workspace-write';
      process.env.CODEX_SKIP_GIT_CHECK = 'false';
      process.env.CODEX_APPROVAL_POLICY = 'on-failure';
      process.env.CODEX_DEFAULT_MODEL = 'o3-codex';

      const config = await loadConfig();

      expect(config.providers.codexsandboxmode).toBe('workspace-write');
      expect(config.providers.codexskipgitcheck).toBe(false);
      expect(config.providers.codexapprovalpolicy).toBe('on-failure');
      expect(config.providers.codexdefaultmodel).toBe('o3-codex');
    });
  });

  describe('Configuration Key Normalization', () => {
    it('should normalize keys to lowercase without underscores', async () => {
      process.env.CODEX_SANDBOX_MODE = 'read-only';
      const config = await loadConfig();

      // Keys should be normalized: CODEX_SANDBOX_MODE -> codexsandboxmode
      expect(config.providers).toHaveProperty('codexsandboxmode');
      expect(config.providers).not.toHaveProperty('CODEX_SANDBOX_MODE');
      expect(config.providers).not.toHaveProperty('codex_sandbox_mode');
    });
  });
});
