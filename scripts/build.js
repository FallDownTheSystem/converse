#!/usr/bin/env node

/**
 * Build Script for Production Deployment
 *
 * Prepares the Converse MCP Server for production deployment by validating
 * configuration, running tests, and creating production-ready artifacts.
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '../src/utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

const logger = createLogger('build');

/**
 * Build configuration
 */
const BUILD_CONFIG = {
  skipTests: process.argv.includes('--skip-tests'),
  skipLinting: process.argv.includes('--skip-lint'),
  verbose: process.argv.includes('--verbose'),
  outputDir: resolve(projectRoot, 'dist'),
  productionEnv: {
    NODE_ENV: 'production',
    LOG_LEVEL: 'info'
  }
};

/**
 * Execute command with proper error handling
 * @param {string} command - Command to execute
 * @param {string} description - Description for logging
 * @returns {string} Command output
 */
function execCommand(command, description) {
  try {
    logger.info(`Running: ${description}`);
    if (BUILD_CONFIG.verbose) {
      logger.debug(`Command: ${command}`);
    }
    
    const output = execSync(command, { 
      encoding: 'utf8', 
      cwd: projectRoot,
      stdio: BUILD_CONFIG.verbose ? 'inherit' : 'pipe'
    });
    
    logger.info(`✓ ${description} completed`);
    return output;
  } catch (error) {
    logger.error(`✗ ${description} failed`, { error: error.message });
    throw new Error(`Build step failed: ${description}`);
  }
}

/**
 * Validate project structure and dependencies
 */
function validateProject() {
  logger.info('📋 Validating project structure...');
  
  const requiredFiles = [
    'package.json',
    'src/index.js',
    'src/config.js',
    'src/router.js'
  ];
  
  const requiredDirs = [
    'src/providers',
    'src/tools',
    'src/utils'
  ];
  
  // Check required files
  for (const file of requiredFiles) {
    const filePath = resolve(projectRoot, file);
    if (!existsSync(filePath)) {
      throw new Error(`Required file missing: ${file}`);
    }
  }
  
  // Check required directories
  for (const dir of requiredDirs) {
    const dirPath = resolve(projectRoot, dir);
    if (!existsSync(dirPath)) {
      throw new Error(`Required directory missing: ${dir}`);
    }
  }
  
  logger.info('✓ Project structure validation passed');
}

/**
 * Check Node.js version compatibility
 */
function validateNodeVersion() {
  logger.info('🏗️ Validating Node.js version...');
  
  const packageJson = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf8'));
  const requiredVersion = packageJson.engines?.node;
  
  if (requiredVersion) {
    const currentVersion = process.version;
    logger.info(`Current Node.js version: ${currentVersion}`);
    logger.info(`Required Node.js version: ${requiredVersion}`);
    
    // Basic version check (could be enhanced with semver)
    const currentMajor = parseInt(currentVersion.substring(1).split('.')[0]);
    const requiredMajor = parseInt(requiredVersion.substring(2).split('.')[0]);
    
    if (currentMajor < requiredMajor) {
      throw new Error(`Node.js version ${requiredVersion} or higher required, got ${currentVersion}`);
    }
  }
  
  logger.info('✓ Node.js version validation passed');
}

/**
 * Run code quality checks
 */
function runQualityChecks() {
  if (BUILD_CONFIG.skipLinting) {
    logger.info('⏭️ Skipping linting (--skip-lint flag)');
    return;
  }
  
  logger.info('🔍 Running code quality checks...');
  
  // Type checking
  execCommand('npm run typecheck', 'Type checking');
  
  // Linting
  execCommand('npm run lint', 'ESLint validation');
  
  // Format checking
  execCommand('npm run format:check', 'Code formatting validation');
  
  logger.info('✓ Code quality checks passed');
}

/**
 * Run test suite
 */
function runTests() {
  if (BUILD_CONFIG.skipTests) {
    logger.info('⏭️ Skipping tests (--skip-tests flag)');
    return;
  }
  
  logger.info('🧪 Running test suite...');
  
  // Unit tests
  execCommand('npm run test', 'Unit tests');
  
  // Provider tests
  execCommand('npm run test:providers', 'Provider tests');
  
  logger.info('✓ All tests passed');
}

/**
 * Create production configuration template
 */
function createProductionConfig() {
  logger.info('⚙️ Creating production configuration...');
  
  const prodConfigPath = resolve(projectRoot, '.env.production.example');
  const prodConfig = `# Converse MCP Server - Production Configuration Template
# Copy this file to .env.production for production deployment

# Production Environment
NODE_ENV=production
LOG_LEVEL=info
PORT=3157

# Required API Keys
OPENAI_API_KEY=sk-your-production-openai-key
XAI_API_KEY=xai-your-production-xai-key
GOOGLE_API_KEY=your-production-google-key

# Provider Configuration
GOOGLE_LOCATION=us-central1
XAI_BASE_URL=https://api.x.ai/v1

# MCP Server Configuration
MCP_SERVER_NAME=converse-mcp-server
MCP_SERVER_VERSION=1.0.0

# Production Settings
# Use 'warn' or 'error' for production logging to reduce noise
# LOG_LEVEL=warn
`;
  
  writeFileSync(prodConfigPath, prodConfig);
  logger.info(`✓ Production config template created: ${prodConfigPath}`);
}

/**
 * Generate build info
 */
function generateBuildInfo() {
  logger.info('📄 Generating build information...');
  
  const packageJson = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf8'));
  
  const buildInfo = {
    name: packageJson.name,
    version: packageJson.version,
    description: packageJson.description,
    buildDate: new Date().toISOString(),
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    gitCommit: getGitCommit(),
    environment: 'production'
  };
  
  const buildInfoPath = resolve(projectRoot, 'build-info.json');
  writeFileSync(buildInfoPath, JSON.stringify(buildInfo, null, 2));
  
  logger.info('✓ Build information generated');
  return buildInfo;
}

/**
 * Get current git commit hash
 * @returns {string} Git commit hash or 'unknown'
 */
function getGitCommit() {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8', stdio: 'pipe' }).trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Create deployment package
 */
function createDeploymentPackage(buildInfo) {
  logger.info('📦 Creating deployment package...');
  
  // Create deployment instructions
  const deploymentInstructions = `# Converse MCP Server - Deployment Instructions

## Production Deployment

### 1. Environment Setup
\`\`\`bash
# Copy production configuration
cp .env.production.example .env.production

# Edit .env.production with your production API keys
nano .env.production
\`\`\`

### 2. Start Production Server
\`\`\`bash
# Production start
npm start

# Or with production environment file
NODE_ENV=production npm start
\`\`\`

### 3. Process Management (recommended)
\`\`\`bash
# Using PM2 (install globally: npm install -g pm2)
pm2 start src/index.js --name converse-mcp-server --env production

# Or using systemd service
sudo systemctl start converse-mcp-server
\`\`\`

### 4. Monitoring
- Logs are output to console/stdout
- Use LOG_LEVEL=warn or LOG_LEVEL=error for production
- Monitor process health and restart on failures

## Build Information
- Version: ${buildInfo.version}
- Build Date: ${buildInfo.buildDate}
- Node.js Version: ${buildInfo.nodeVersion}
- Git Commit: ${buildInfo.gitCommit}

## Health Check
The server starts on port ${BUILD_CONFIG.productionEnv.PORT || 3157} and uses stdio transport for MCP communication.
`;
  
  const deploymentPath = resolve(projectRoot, 'DEPLOYMENT.md');
  writeFileSync(deploymentPath, deploymentInstructions);
  
  logger.info('✓ Deployment package created');
}

/**
 * Main build function
 */
async function build() {
  const startTime = Date.now();
  
  try {
    logger.info('🏗️ Starting Converse MCP Server build process...');
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Step 1: Validate project
    validateProject();
    validateNodeVersion();
    
    // Step 2: Quality checks
    runQualityChecks();
    
    // Step 3: Run tests
    runTests();
    
    // Step 4: Generate production artifacts
    createProductionConfig();
    const buildInfo = generateBuildInfo();
    createDeploymentPackage(buildInfo);
    
    const buildTime = Date.now() - startTime;
    
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info('🎉 Build completed successfully!');
    logger.info(`📊 Build Statistics:`);
    logger.info(`   • Build Time: ${buildTime}ms`);
    logger.info(`   • Version: ${buildInfo.version}`);
    logger.info(`   • Node.js: ${buildInfo.nodeVersion}`);
    logger.info(`   • Platform: ${buildInfo.platform}/${buildInfo.arch}`);
    
    logger.info('📦 Production files created:');
    logger.info('   • .env.production.example - Production configuration template');
    logger.info('   • build-info.json - Build metadata');
    logger.info('   • DEPLOYMENT.md - Deployment instructions');
    
    logger.info('🚀 Ready for production deployment!');
    
  } catch (error) {
    logger.error('💥 Build failed', { error });
    process.exit(1);
  }
}

// Run build if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  build();
}

export { build, BUILD_CONFIG };