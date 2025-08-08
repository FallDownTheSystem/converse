#!/usr/bin/env node

/**
 * Converse MCP Server - CLI Entry Point
 * 
 * This script allows the MCP server to be run via npx/pnpm dlx for easy installation and execution.
 */

import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { createRequire } from 'module';

// Get the directory of this script
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get the project root (parent of bin directory)
const projectRoot = dirname(__dirname);

// Change working directory to project root so Node.js can find dependencies
process.chdir(projectRoot);

// Import and start the server
try {
  const indexPath = join(projectRoot, 'src/index.js');
  const { main } = await import(pathToFileURL(indexPath).href);
  
  // The main function will handle all logging appropriately based on transport type
  await main();
} catch (error) {
  // For stdio transport, we must not output anything to stdout
  // For http transport, this will be logged by the error handler in main
  // Just exit with error code
  process.exit(1);
}