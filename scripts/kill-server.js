#!/usr/bin/env node

/**
 * Kill Server Script
 * 
 * Cross-platform script to kill any process running on port 3000
 * Used to prevent EADDRINUSE errors during development
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const PORT = process.env.PORT || 3000;

async function killServerOnPort(port) {
  try {
    console.log(`🔍 Checking for processes on port ${port}...`);

    let command;
    if (process.platform === 'win32') {
      // Windows
      command = `netstat -ano | findstr :${port}`;
    } else {
      // Unix-like (Linux, macOS)
      command = `lsof -ti:${port}`;
    }

    const { stdout } = await execAsync(command);
    
    if (!stdout.trim()) {
      console.log(`✅ No server running on port ${port}`);
      return;
    }

    // Extract PIDs and kill processes
    let pids = [];
    
    if (process.platform === 'win32') {
      // Parse Windows netstat output
      const lines = stdout.trim().split('\n');
      pids = lines
        .map(line => {
          const parts = line.trim().split(/\s+/);
          return parts[parts.length - 1]; // Last column is PID
        })
        .filter(pid => pid && !isNaN(pid));
    } else {
      // Unix-like systems - lsof returns PIDs directly
      pids = stdout.trim().split('\n').filter(pid => pid && !isNaN(pid));
    }

    if (pids.length === 0) {
      console.log(`✅ No processes found on port ${port}`);
      return;
    }

    console.log(`🎯 Found ${pids.length} process(es) on port ${port}: ${pids.join(', ')}`);

    // Kill each process
    for (const pid of pids) {
      try {
        let killCommand;
        if (process.platform === 'win32') {
          // Use cmd /c to ensure proper Windows command execution
          killCommand = `cmd /c "taskkill /PID ${pid} /F"`;
        } else {
          killCommand = `kill -9 ${pid}`;
        }

        await execAsync(killCommand);
        console.log(`✅ Killed process ${pid}`);
      } catch (error) {
        console.log(`⚠️  Could not kill process ${pid} (may have already exited)`);
      }
    }

    // Wait a moment for processes to fully terminate
    console.log('⏳ Waiting for processes to terminate...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify port is actually free
    try {
      const { stdout: checkStdout } = await execAsync(command);
      if (checkStdout.trim()) {
        console.log(`⚠️  Some processes may still be running on port ${port}`);
        // Try one more time with different approach
        if (process.platform === 'win32') {
          try {
            const { stdout: retryStdout } = await execAsync(`netstat -ano | findstr :${port}`);
            const retryLines = retryStdout.trim().split('\n');
            const retryPids = retryLines
              .map(line => {
                const parts = line.trim().split(/\s+/);
                return parts[parts.length - 1];
              })
              .filter(pid => pid && !isNaN(pid));
            
            for (const pid of retryPids) {
              await execAsync(`cmd /c "taskkill /PID ${pid} /F"`).catch(() => {});
            }
          } catch (error) {
            // Ignore retry errors
          }
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      // Error means no processes found, which is good
    }

    console.log(`🎉 Port ${port} is now available`);

  } catch (error) {
    // If command fails, it usually means no processes are running
    console.log(`✅ No server running on port ${port}`);
  }
}

// Run the script
killServerOnPort(PORT).catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});