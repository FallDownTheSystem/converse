/**
 * Help Resource Handler
 *
 * Exposes comprehensive documentation and server information as an MCP resource.
 * Provides the same content as the help prompt plus version information.
 */

import { generateHelpContent } from '../prompts/helpPrompt.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get the current server version from package.json
 * @returns {string} Server version
 */
function getServerVersion() {
  try {
    const packagePath = join(__dirname, '../../package.json');
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
    return packageJson.version || 'unknown';
  } catch (error) {
    return 'unknown';
  }
}

/**
 * Resource metadata for the help documentation
 */
export const helpResourceMetadata = {
  uri: 'converse://help',
  name: 'Help Documentation',
  description: 'Comprehensive guide for the Converse MCP Server including all tools, parameters, providers, and models',
  mimeType: 'text/plain'
};

/**
 * Handler for reading the help resource
 * @returns {object} Resource content
 */
export async function helpResourceHandler() {
  const helpContent = generateHelpContent();
  const version = getServerVersion();

  // Add version information to the help content
  const contentWithVersion = `${helpContent}\n\n## Server Information\n\n- **Version**: ${version}\n- **Protocol**: MCP (Model Context Protocol)\n- **Server Type**: HTTP Transport\n- **Default Port**: 3157\n`;

  return {
    contents: [{
      uri: helpResourceMetadata.uri,
      mimeType: helpResourceMetadata.mimeType,
      text: contentWithVersion
    }]
  };
}

/**
 * Get list of all available resources
 * @returns {array} List of resource metadata
 */
export function listResources() {
  return [helpResourceMetadata];
}
