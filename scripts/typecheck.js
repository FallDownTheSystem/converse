#!/usr/bin/env node

import { spawn } from 'child_process';
import { readdirSync, statSync } from 'fs';
import path from 'path';

/**
 * TypeScript typecheck script for Node.js files
 * Recursively finds all .js files and runs node --check on them
 */

async function typecheck() {
  try {
    // Find all .js files in src directory
    const files = findJSFiles('src');
    
    if (files.length === 0) {
      console.log('No JavaScript files found in src/');
      process.exit(0);
    }

    console.log(`Typechecking ${files.length} files...`);
    
    let hasErrors = false;
    
    // Check each file
    for (const file of files) {
      const result = await checkFile(file);
      if (!result) {
        hasErrors = true;
      }
    }
    
    if (hasErrors) {
      console.error('❌ TypeScript check failed');
      process.exit(1);
    } else {
      console.log('✅ TypeScript check passed');
      process.exit(0);
    }
    
  } catch (error) {
    console.error('Error during typecheck:', error.message);
    process.exit(1);
  }
}

function checkFile(file) {
  return new Promise((resolve) => {
    const child = spawn('node', ['--check', file], { 
      stdio: ['inherit', 'inherit', 'pipe'] 
    });
    
    let stderr = '';
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      if (code !== 0) {
        console.error(`❌ ${file}: ${stderr.trim()}`);
        resolve(false);
      } else {
        resolve(true);
      }
    });
    
    child.on('error', (error) => {
      console.error(`❌ ${file}: ${error.message}`);
      resolve(false);
    });
  });
}

function findJSFiles(dir) {
  let files = [];
  
  try {
    const items = readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = statSync(fullPath);
      
      if (stat.isDirectory()) {
        files = files.concat(findJSFiles(fullPath));
      } else if (item.endsWith('.js')) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    console.warn(`Warning: Could not read directory ${dir}:`, error.message);
  }
  
  return files;
}

// Run the typecheck
typecheck().catch(console.error);