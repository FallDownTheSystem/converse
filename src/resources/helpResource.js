/**
 * Help Resource Handler
 *
 * Exposes comprehensive documentation and server information as an MCP resource.
 * Provides the same content as the help prompt plus version information.
 */

import { generateHelpContent } from '../prompts/helpPrompt.js';
import { getPackageVersion } from '../utils/version.js';

/**
 * Resource metadata for the help documentation
 */
export const helpResourceMetadata = {
  uri: 'converse://help',
  name: 'Help Documentation',
  description:
    'Comprehensive guide for the Converse MCP Server including all tools, parameters, providers, and models',
  mimeType: 'text/plain',
};

/**
 * Handler for reading the help resource
 * @param {object} config - Configuration object (optional)
 * @returns {object} Resource content
 */
export async function helpResourceHandler(config = null) {
  const helpContent = generateHelpContent(config);
  const version = getPackageVersion();

  // Add version information to the help content
  const contentWithVersion = `${helpContent}\n\n## Server Information\n\n- **Version**: ${version}\n- **Protocol**: MCP (Model Context Protocol)\n- **Server Type**: HTTP Transport\n- **Default Port**: 3157\n`;

  return {
    contents: [
      {
        uri: helpResourceMetadata.uri,
        mimeType: helpResourceMetadata.mimeType,
        text: contentWithVersion,
      },
    ],
  };
}

/**
 * Get list of all available resources
 * @returns {array} List of resource metadata
 */
export function listResources() {
  return [helpResourceMetadata];
}
