#!/usr/bin/env node
/**
 * Health check script for Converse MCP Server Docker container
 */

import { exec } from 'child_process';
import { promises as fs } from 'fs';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

/**
 * Check if the main Node.js server process is running
 */
async function checkProcess() {
  try {
    const { stdout } = await execAsync('pgrep -f "node.*src/index.js"');
    return stdout.trim().length > 0;
  } catch (error) {
    console.error(`Process check failed: ${error.message}`);
    return false;
  }
}

/**
 * Check if critical Node.js modules can be imported
 */
async function checkNodeModules() {
  const criticalModules = [
    '@modelcontextprotocol/sdk',
    'express',
    'dotenv',
    'openai',
    '@google/generative-ai'
  ];

  for (const moduleName of criticalModules) {
    try {
      await import(moduleName);
    } catch (error) {
      console.error(`Critical module ${moduleName} cannot be imported: ${error.message}`);
      return false;
    }
  }
  return true;
}

/**
 * Check if logs directory is writable
 */
async function checkLogDirectory() {
  const logDir = '/app/logs';
  
  try {
    // Check if directory exists
    await fs.access(logDir);
    
    // Test write permissions
    const testFile = path.join(logDir, '.health_check');
    await fs.writeFile(testFile, 'health_check');
    await fs.unlink(testFile);
    
    return true;
  } catch (error) {
    console.error(`Log directory check failed: ${error.message}`);
    return false;
  }
}

/**
 * Check if essential environment variables are present
 */
function checkEnvironment() {
  const apiKeys = [
    'OPENAI_API_KEY',
    'GOOGLE_API_KEY', 
    'XAI_API_KEY'
  ];

  // At least one API key should be present
  const hasApiKey = apiKeys.some(key => process.env[key]);
  if (!hasApiKey) {
    console.error('No API keys found in environment');
    return false;
  }

  // Validate API key formats (basic checks)
  for (const key of apiKeys) {
    const value = process.env[key];
    if (value) {
      if (value.trim().length < 10) {
        console.error(`API key ${key} appears too short or invalid`);
        return false;
      }
    }
  }

  return true;
}

/**
 * Check if HTTP transport is responding
 */
async function checkHttpTransport() {
  try {
    const port = process.env.HTTP_PORT || process.env.PORT || 3000;
    const response = await fetch(`http://localhost:${port}/health`);
    
    if (response.ok) {
      const data = await response.json();
      return data.status === 'healthy';
    }
    return false;
  } catch (error) {
    console.error(`HTTP transport check failed: ${error.message}`);
    return false;
  }
}

/**
 * Main health check function
 */
async function main() {
  const checks = [
    { name: 'Process', fn: checkProcess },
    { name: 'Node modules', fn: checkNodeModules },
    { name: 'Log directory', fn: checkLogDirectory },
    { name: 'Environment', fn: checkEnvironment },
    { name: 'HTTP transport', fn: checkHttpTransport }
  ];

  const failedChecks = [];

  for (const { name, fn } of checks) {
    try {
      const result = await fn();
      if (!result) {
        failedChecks.push(name);
      }
    } catch (error) {
      console.error(`Error in ${name} check: ${error.message}`);
      failedChecks.push(name);
    }
  }

  if (failedChecks.length > 0) {
    console.error(`Health check failed: ${failedChecks.join(', ')}`);
    process.exit(1);
  }

  console.log('Health check passed');
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(`Health check error: ${error.message}`);
    process.exit(1);
  });
}