/**
 * Local Provider Availability Probes
 *
 * Cheap, synchronous checks for the CLI/SDK providers: the SDK package
 * resolves and a credential is present. They never spawn a process or call a
 * network endpoint, so they cannot prove a login is still valid — a stale
 * credential surfaces as an auth error at invoke time, where bare-name and
 * "auto" routing fail over to the next provider.
 */

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const resolvedPackages = new Map();

/**
 * Whether an npm package resolves from this module. Cached per process:
 * installing a package requires a restart to load it anyway.
 * @param {string} packageName
 * @returns {boolean}
 */
export function isPackageResolvable(packageName) {
  if (!resolvedPackages.has(packageName)) {
    let resolvable;
    try {
      import.meta.resolve(packageName);
      resolvable = true;
    } catch {
      resolvable = false;
    }
    resolvedPackages.set(packageName, resolvable);
  }
  return resolvedPackages.get(packageName);
}

/**
 * Codex credentials: CODEX_API_KEY, or the ChatGPT login file the Codex CLI
 * writes to $CODEX_HOME/auth.json (default ~/.codex).
 * @param {object} config
 * @returns {boolean}
 */
export function hasCodexCredentials(config) {
  if (config?.providers?.codexapikey) return true;
  const codexHome = process.env.CODEX_HOME || join(homedir(), '.codex');
  return existsSync(join(codexHome, 'auth.json'));
}

/**
 * Claude Code credentials: an OAuth token or API key in the environment the
 * spawned CLI inherits, or the login file in $CLAUDE_CONFIG_DIR (default
 * ~/.claude). macOS keeps the login in the Keychain, which cannot be read
 * without spawning a process, so a login there is assumed.
 * @returns {boolean}
 */
export function hasClaudeCredentials() {
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_API_KEY) {
    return true;
  }
  if (process.platform === 'darwin') return true;
  const configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
  return existsSync(join(configDir, '.credentials.json'));
}
