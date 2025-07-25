#!/usr/bin/env node

/**
 * Development Server Helper
 *
 * Enhanced development server with additional debugging capabilities,
 * configuration validation, and development-specific features.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createLogger } from './src/utils/logger.js';

const logger = createLogger('dev-server');

/**
 * Development server configuration
 */
const DEV_CONFIG = {
  autoRestart: true,
  validateConfig: true,
  showStackTraces: true,
  enableDebugOutput: true,
  logApiCalls: process.env.LOG_API_CALLS === 'true',
  mockProviders: process.env.MOCK_PROVIDERS === 'true'
};

/**
 * Check if .env file exists and provide helpful guidance
 */
function checkEnvironmentSetup() {
  const envPath = resolve('.env');
  const envExamplePath = resolve('.env.example');
  
  if (!existsSync(envPath)) {
    logger.warn('No .env file found');
    
    if (existsSync(envExamplePath)) {
      logger.info('Found .env.example file. Copy it to .env and add your API keys:');
      logger.info('  cp .env.example .env');
    } else {
      logger.info('Create a .env file with your API keys. Example:');
      logger.info('  OPENAI_API_KEY=sk-your-key-here');
    }
    
    logger.info('You can still run the server, but tools will fail without API keys');
    return false;
  }
  
  return true;
}

/**
 * Display development server information
 */
function showDevInfo() {
  logger.info('🚀 Converse MCP Server - Development Mode');
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const hasEnv = checkEnvironmentSetup();
  
  logger.info('Configuration:');
  logger.info(`  • Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`  • Log Level: ${process.env.LOG_LEVEL || 'info'}`);
  logger.info(`  • Port: ${process.env.PORT || '3000'}`);
  logger.info(`  • Auto Restart: ${DEV_CONFIG.autoRestart ? '✓' : '✗'}`);
  logger.info(`  • Environment File: ${hasEnv ? '✓' : '✗'}`);
  
  // Check for API keys
  const apiKeys = {
    'OpenAI': !!process.env.OPENAI_API_KEY,
    'XAI': !!process.env.XAI_API_KEY,
    'Google': !!process.env.GOOGLE_API_KEY
  };
  
  logger.info('API Keys:');
  Object.entries(apiKeys).forEach(([provider, hasKey]) => {
    logger.info(`  • ${provider}: ${hasKey ? '✓' : '✗'}`);
  });
  
  if (!Object.values(apiKeys).some(Boolean)) {
    logger.warn('⚠️  No API keys configured - tools will fail to execute');
  }
  
  logger.info('Development Commands:');
  logger.info('  • npm run dev - Start with debug logging');
  logger.info('  • npm run dev:quiet - Start with minimal logging');
  logger.info('  • npm run dev:verbose - Start with trace logging');
  logger.info('  • npm run debug - Start with Node.js inspector');
  logger.info('  • npm run test:watch - Run tests in watch mode');
  
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

/**
 * Enhanced error handler for development
 */
function setupDevErrorHandlers() {
  process.on('uncaughtException', (error) => {
    logger.error('💥 Uncaught Exception in Development Server', { error });
    
    if (DEV_CONFIG.showStackTraces) {
      console.error('\n📚 Full Stack Trace:');
      console.error(error.stack);
    }
    
    logger.info('🔄 Server will restart automatically due to --watch flag');
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('💥 Unhandled Promise Rejection in Development Server', { 
      error: reason,
      data: { promise: promise.toString() }
    });
    
    if (DEV_CONFIG.showStackTraces && reason.stack) {
      console.error('\n📚 Full Stack Trace:');
      console.error(reason.stack);
    }
    
    logger.info('🔄 Server will restart automatically due to --watch flag');
  });
}

/**
 * Main development server function
 */
async function startDevServer() {
  try {
    // Show development information
    showDevInfo();
    
    // Set up enhanced error handling
    setupDevErrorHandlers();
    
    // Set development environment if not already set
    if (!process.env.NODE_ENV) {
      process.env.NODE_ENV = 'development';
    }
    
    // Set debug log level if not already set
    if (!process.env.LOG_LEVEL) {
      process.env.LOG_LEVEL = 'debug';
    }
    
    logger.info('🎯 Starting MCP Server...');
    
    // Import and start the main server
    const { default: main } = await import('./src/index.js');
    
  } catch (error) {
    logger.error('💥 Failed to start development server', { error });
    
    if (DEV_CONFIG.showStackTraces) {
      console.error('\n📚 Full Stack Trace:');
      console.error(error.stack);
    }
    
    process.exit(1);
  }
}

// Only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startDevServer();
}

export { startDevServer, DEV_CONFIG };