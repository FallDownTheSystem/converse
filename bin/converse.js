#!/usr/bin/env node

/**
 * Converse MCP Server - CLI Entry Point
 * 
 * This script allows the MCP server to be run via npx/pnpm dlx for easy installation and execution.
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createRequire } from 'module';

// Get the directory of this script
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get the project root (parent of bin directory)
const projectRoot = dirname(__dirname);

// Import and start the server
try {
  const { startServer } = await import(join(projectRoot, 'src/index.js'));
  
  console.log('🚀 Starting Converse MCP Server...');
  console.log(`📁 Project root: ${projectRoot}`);
  
  await startServer();
} catch (error) {
  console.error('❌ Failed to start Converse MCP Server:', error.message);
  
  if (error.code === 'ERR_MODULE_NOT_FOUND') {
    console.error('\n💡 Troubleshooting:');
    console.error('   1. Ensure you have Node.js >= 20.0.0');
    console.error('   2. Try: npm install (if running from source)');
    console.error('   3. Check that all dependencies are installed');
  } else if (error.message.includes('API key')) {
    console.error('\n🔑 API Key Configuration:');
    console.error('   1. Create a .env file with your API keys');
    console.error('   2. Set environment variables in your MCP client');
    console.error('   3. See README.md for detailed setup instructions');
  }
  
  process.exit(1);
}