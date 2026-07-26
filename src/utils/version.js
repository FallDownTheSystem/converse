/**
 * Package Version Utility
 *
 * Single source for the server version so the CLI, MCP handshake and help
 * resource never disagree about which version is running.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

let cachedVersion;

/**
 * Get the server version from package.json
 * @returns {string} Semver string, or 'unknown' if package.json is unreadable
 */
export function getPackageVersion() {
  if (cachedVersion === undefined) {
    try {
      const packagePath = join(
        dirname(fileURLToPath(import.meta.url)),
        '../../package.json',
      );
      cachedVersion = JSON.parse(readFileSync(packagePath, 'utf8')).version || 'unknown';
    } catch {
      cachedVersion = 'unknown';
    }
  }

  return cachedVersion;
}
