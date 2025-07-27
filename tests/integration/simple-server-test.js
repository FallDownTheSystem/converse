#!/usr/bin/env node

/**
 * Simple Server Test - Basic connectivity and functionality
 */

import { spawn } from 'child_process';
import { getNodeCommand, getSpawnOptions } from '../../src/utils/pathUtils.js';

function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level}] ${message}`);
}

async function testServerStartup() {
  log('Testing server startup...');

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (serverProcess && !serverProcess.killed) {
        serverProcess.kill('SIGTERM');
      }
      reject(new Error('Server startup timeout after 15 seconds'));
    }, 15000);

    const serverProcess = spawn(getNodeCommand(), ['src/index.js'], getSpawnOptions({
      env: {
        ...process.env,
        NODE_ENV: 'test',
        LOG_LEVEL: 'info',
        PORT: '3002',
        MCP_TRANSPORT: 'http'
      },
      stdio: ['pipe', 'pipe', 'pipe']
    }));

    let startupSuccess = false;

    serverProcess.stderr.on('data', (data) => {
      const output = data.toString();
      log(`Server: ${output.trim()}`);

      if (output.includes('started successfully') && !startupSuccess) {
        startupSuccess = true;
        clearTimeout(timeout);

        log('Server started successfully!');

        // Give it a moment then kill
        setTimeout(() => {
          serverProcess.kill('SIGTERM');
          resolve({
            success: true,
            message: 'Server started and stopped successfully'
          });
        }, 2000);
      }
    });

    serverProcess.stdout.on('data', (data) => {
      log(`Server stdout: ${data.toString().trim()}`);
    });

    serverProcess.on('error', (error) => {
      clearTimeout(timeout);
      reject(new Error(`Server process error: ${error.message}`));
    });

    serverProcess.on('exit', (code, signal) => {
      clearTimeout(timeout);
      if (!startupSuccess) {
        reject(new Error(`Server exited early with code ${code}, signal ${signal}`));
      }
    });
  });
}

async function testBasicFunctionality() {
  log('Testing basic HTTP functionality...');

  // Start server
  const serverProcess = spawn(getNodeCommand(), ['src/index.js'], getSpawnOptions({
    env: {
      ...process.env,
      NODE_ENV: 'test',
      LOG_LEVEL: 'info',
      PORT: '3003',
      MCP_TRANSPORT: 'http'
    },
    stdio: ['pipe', 'pipe', 'pipe']
  }));

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      serverProcess.kill('SIGTERM');
      reject(new Error('Server functionality test timeout'));
    }, 20000);

    let serverReady = false;

    serverProcess.stderr.on('data', (data) => {
      const output = data.toString();
      log(`Server: ${output.trim()}`);

      if (output.includes('started successfully') && !serverReady) {
        serverReady = true;
        log('Server ready, testing HTTP endpoint...');

        // Test basic HTTP connectivity
        testHTTPEndpoint(3003)
          .then((result) => {
            clearTimeout(timeout);
            serverProcess.kill('SIGTERM');
            resolve(result);
          })
          .catch((error) => {
            clearTimeout(timeout);
            serverProcess.kill('SIGTERM');
            reject(error);
          });
      }
    });

    serverProcess.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    serverProcess.on('exit', (code, signal) => {
      if (!serverReady) {
        clearTimeout(timeout);
        reject(new Error(`Server exited before ready: code ${code}, signal ${signal}`));
      }
    });
  });
}

async function testHTTPEndpoint(port) {
  // Simple HTTP test using fetch
  try {
    // Test health endpoint if available
    const healthResponse = await fetch(`http://localhost:${port}/health`);
    if (healthResponse.ok) {
      const healthData = await healthResponse.text();
      log(`Health endpoint response: ${healthData}`);
    }
  } catch (error) {
    log(`Health endpoint not available: ${error.message}`);
  }

  try {
    // Test info endpoint if available
    const infoResponse = await fetch(`http://localhost:${port}/info`);
    if (infoResponse.ok) {
      const infoData = await infoResponse.json();
      log(`Info endpoint response: ${JSON.stringify(infoData)}`);
      return {
        success: true,
        message: 'HTTP endpoints responding',
        data: infoData
      };
    }
  } catch (error) {
    log(`Info endpoint not available: ${error.message}`);
  }

  // If no endpoints work, at least check if server is listening
  try {
    const response = await fetch(`http://localhost:${port}/`);
    return {
      success: true,
      message: `Server responding on port ${port}`,
      status: response.status
    };
  } catch (error) {
    throw new Error(`Server not responding on port ${port}: ${error.message}`);
  }
}

async function runAllTests() {
  const results = [];

  try {
    // Test 1: Server startup
    log('=== Test 1: Server Startup ===');
    const startupResult = await testServerStartup();
    results.push({ test: 'Server Startup', ...startupResult });
    log(`✓ Server Startup: ${startupResult.message}`);
  } catch (error) {
    results.push({ test: 'Server Startup', success: false, error: error.message });
    log(`✗ Server Startup: ${error.message}`);
  }

  try {
    // Test 2: Basic functionality
    log('\n=== Test 2: Basic HTTP Functionality ===');
    const funcResult = await testBasicFunctionality();
    results.push({ test: 'Basic HTTP Functionality', ...funcResult });
    log(`✓ Basic HTTP Functionality: ${funcResult.message}`);
  } catch (error) {
    results.push({ test: 'Basic HTTP Functionality', success: false, error: error.message });
    log(`✗ Basic HTTP Functionality: ${error.message}`);
  }

  // Print summary
  const passed = results.filter(r => r.success).length;
  const total = results.length;

  log('\n' + '='.repeat(50));
  log('SIMPLE SERVER TEST RESULTS');
  log('='.repeat(50));
  log(`Passed: ${passed}/${total}`);

  results.forEach(r => {
    const status = r.success ? '✓' : '✗';
    const message = r.success ? r.message : r.error;
    log(`${status} ${r.test}: ${message}`);
  });

  return { passed, total, results };
}

// Run tests
runAllTests()
  .then((report) => {
    process.exit(report.passed === report.total ? 0 : 1);
  })
  .catch((error) => {
    log(`Test execution failed: ${error.message}`, 'ERROR');
    process.exit(1);
  });
