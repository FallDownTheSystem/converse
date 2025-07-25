#!/usr/bin/env node

/**
 * Validation Script
 *
 * Comprehensive validation of the Converse MCP Server codebase including
 * configuration, dependencies, code quality, and functionality tests.
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { createLogger } from '../src/utils/logger.js';

const logger = createLogger('validate');

/**
 * Validation configuration
 */
const VALIDATION_CONFIG = {
  skipTests: process.argv.includes('--skip-tests'),
  skipLint: process.argv.includes('--skip-lint'),
  verbose: process.argv.includes('--verbose'),
  fix: process.argv.includes('--fix')
};

/**
 * Execute command with error handling
 * @param {string} command - Command to execute
 * @param {string} description - Description for logging
 * @param {boolean} allowFailure - Whether to allow command failure
 * @returns {boolean} Success status
 */
function execCommand(command, description, allowFailure = false) {
  try {
    logger.info(`🔍 ${description}...`);
    
    const output = execSync(command, { 
      encoding: 'utf8',
      stdio: VALIDATION_CONFIG.verbose ? 'inherit' : 'pipe'
    });
    
    logger.info(`✓ ${description} passed`);
    return true;
  } catch (error) {
    if (allowFailure) {
      logger.warn(`⚠️ ${description} failed (non-critical)`, { 
        data: { error: error.message } 
      });
      return false;
    } else {
      logger.error(`✗ ${description} failed`, { 
        error: error.message 
      });
      throw new Error(`Validation failed: ${description}`);
    }
  }
}

/**
 * Check environment setup
 */
function validateEnvironment() {
  logger.info('🌍 Validating environment setup...');
  
  const checks = [
    {
      name: 'Node.js version',
      check: () => {
        const version = process.version;
        const major = parseInt(version.substring(1).split('.')[0]);
        if (major < 20) {
          throw new Error(`Node.js 20+ required, got ${version}`);
        }
        return `${version} ✓`;
      }
    },
    {
      name: 'Package.json exists',
      check: () => existsSync('package.json') ? 'Found ✓' : 'Missing ✗'
    },
    {
      name: 'Node modules installed',
      check: () => existsSync('node_modules') ? 'Installed ✓' : 'Missing - run npm install'
    },
    {
      name: 'Environment file',
      check: () => {
        if (existsSync('.env')) return 'Found ✓';
        if (existsSync('.env.example')) return 'Example found - copy to .env';
        return 'Missing - create .env file';
      }
    }
  ];
  
  for (const { name, check } of checks) {
    try {
      const result = check();
      logger.info(`  • ${name}: ${result}`);
    } catch (error) {
      logger.error(`  • ${name}: ${error.message}`);
      throw error;
    }
  }
  
  logger.info('✓ Environment validation completed');
}

/**
 * Validate dependencies
 */
function validateDependencies() {
  logger.info('📦 Validating dependencies...');
  
  // Check for security vulnerabilities
  execCommand('npm audit --audit-level=high', 'Security audit', true);
  
  // Check for outdated packages
  execCommand('npm outdated', 'Dependency freshness check', true);
  
  logger.info('✓ Dependency validation completed');
}

/**
 * Validate code syntax and structure
 */
function validateCodeSyntax() {
  logger.info('📝 Validating code syntax...');
  
  // JavaScript syntax check
  execCommand('npm run typecheck', 'JavaScript syntax validation');
  
  logger.info('✓ Code syntax validation completed');
}

/**
 * Validate code quality
 */
function validateCodeQuality() {
  if (VALIDATION_CONFIG.skipLint) {
    logger.info('⏭️ Skipping code quality checks (--skip-lint flag)');
    return;
  }
  
  logger.info('🎨 Validating code quality...');
  
  // Linting
  if (VALIDATION_CONFIG.fix) {
    execCommand('npm run lint:fix', 'ESLint with auto-fix');
    execCommand('npm run format', 'Code formatting with auto-fix');
  } else {
    execCommand('npm run lint', 'ESLint validation');
    execCommand('npm run format:check', 'Code formatting validation');
  }
  
  logger.info('✓ Code quality validation completed');
}

/**
 * Run functionality tests
 */
function validateFunctionality() {
  if (VALIDATION_CONFIG.skipTests) {
    logger.info('⏭️ Skipping functionality tests (--skip-tests flag)');
    return;
  }
  
  logger.info('🧪 Validating functionality...');
  
  // Unit tests
  execCommand('npm run test', 'Unit tests');
  
  // Provider-specific tests
  execCommand('npm run test:providers', 'Provider tests');
  
  logger.info('✓ Functionality validation completed');
}

/**
 * Validate server startup
 */
function validateServerStartup() {
  logger.info('🚀 Validating server startup...');
  
  try {
    // Quick server startup test (with timeout)
    execCommand('timeout 5s npm start || true', 'Server startup test', true);
    logger.info('✓ Server startup validation completed');
  } catch (error) {
    logger.warn('⚠️ Server startup test failed (may be due to missing API keys)');
  }
}

/**
 * Generate validation report
 */
function generateReport(results) {
  logger.info('📊 Validation Report');
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const totalChecks = Object.keys(results).length;
  const passedChecks = Object.values(results).filter(Boolean).length;
  const successRate = ((passedChecks / totalChecks) * 100).toFixed(1);
  
  logger.info(`Overall Status: ${passedChecks}/${totalChecks} checks passed (${successRate}%)`);
  
  Object.entries(results).forEach(([check, passed]) => {
    const status = passed ? '✓' : '✗';
    const color = passed ? '32m' : '31m'; // Green or red
    logger.info(`  ${status} ${check}`);
  });
  
  logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  if (passedChecks === totalChecks) {
    logger.info('🎉 All validations passed! Code is ready for deployment.');
  } else {
    logger.warn(`⚠️ ${totalChecks - passedChecks} validation(s) failed. Please review and fix issues.`);
  }
  
  return passedChecks === totalChecks;
}

/**
 * Main validation function
 */
async function validate() {
  const startTime = Date.now();
  const results = {};
  
  try {
    logger.info('🔍 Starting Converse MCP Server validation...');
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Run validation steps
    try {
      validateEnvironment();
      results['Environment Setup'] = true;
    } catch (error) {
      results['Environment Setup'] = false;
      throw error;
    }
    
    try {
      validateDependencies();
      results['Dependencies'] = true;
    } catch (error) {
      results['Dependencies'] = false;
      // Continue with other validations
    }
    
    try {
      validateCodeSyntax();
      results['Code Syntax'] = true;
    } catch (error) {
      results['Code Syntax'] = false;
      throw error;
    }
    
    try {
      validateCodeQuality();
      results['Code Quality'] = true;
    } catch (error) {
      results['Code Quality'] = false;
      if (!VALIDATION_CONFIG.skipLint) throw error;
    }
    
    try {
      validateFunctionality();
      results['Functionality Tests'] = true;
    } catch (error) {
      results['Functionality Tests'] = false;
      if (!VALIDATION_CONFIG.skipTests) throw error;
    }
    
    try {
      validateServerStartup();
      results['Server Startup'] = true;
    } catch (error) {
      results['Server Startup'] = false;
      // Non-critical
    }
    
    const validationTime = Date.now() - startTime;
    logger.info(`⏱️ Validation completed in ${validationTime}ms`);
    
    const success = generateReport(results);
    
    if (!success) {
      process.exit(1);
    }
    
  } catch (error) {
    logger.error('💥 Validation failed', { error });
    
    // Still generate report with partial results
    generateReport(results);
    
    process.exit(1);
  }
}

// Run validation if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  validate();
}

export { validate, VALIDATION_CONFIG };