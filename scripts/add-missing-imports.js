#!/usr/bin/env node

/**
 * Script to add missing imports for testWithApiKeys to files that use it
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function addImportToFile(filePath) {
  console.log(`Checking ${filePath}...`);
  
  let content = await fs.readFile(filePath, 'utf-8');
  
  // Check if file uses testWithApiKeys but doesn't import it
  if (content.includes('testWithApiKeys(') && !content.includes('import { testWithApiKeys')) {
    // Find where to insert the import (after the last import statement)
    const importRegex = /^import .* from .*;\s*$/gm;
    let lastImportMatch;
    let match;
    
    while ((match = importRegex.exec(content)) !== null) {
      lastImportMatch = match;
    }
    
    if (lastImportMatch) {
      const insertPosition = lastImportMatch.index + lastImportMatch[0].length;
      
      // Check which variables are used in the file
      const usedVars = [];
      if (content.includes('testWithApiKeys(')) usedVars.push('testWithApiKeys');
      if (content.match(/\bhasOpenAI\b/) && !content.includes('const hasOpenAI =')) usedVars.push('hasOpenAI');
      if (content.match(/\bhasXAI\b/) && !content.includes('const hasXAI =')) usedVars.push('hasXAI');
      if (content.match(/\bhasGoogle\b/) && !content.includes('const hasGoogle =')) usedVars.push('hasGoogle');
      if (content.match(/\bhasAnyMainProvider\b/) && !content.includes('const hasAnyMainProvider =')) usedVars.push('hasAnyMainProvider');
      if (content.match(/\bgetSkipMessage\b/) && !content.includes('const getSkipMessage =')) usedVars.push('getSkipMessage');
      
      const importStatement = `\nimport { \n  ${usedVars.join(', \n  ')} \n} from '../../utils/conditionalTest.js';`;
      
      // Insert the import
      content = content.slice(0, insertPosition) + importStatement + content.slice(insertPosition);
      
      // Remove the old manual API key checks if they exist
      const manualChecksRegex = /\s*\/\/ Check environment variables directly for skipIf conditions[\s\S]*?const hasAnyApiKey = hasOpenAI \|\| hasXAI \|\| hasGoogle;\s*/;
      content = content.replace(manualChecksRegex, '\n');
      
      await fs.writeFile(filePath, content);
      console.log(`✓ Added import to ${filePath}`);
      return true;
    }
  }
  
  console.log(`- No changes needed for ${filePath}`);
  return false;
}

async function main() {
  const testDir = path.join(__dirname, '..', 'tests');
  
  // Files to check
  const filesToCheck = [
    'integration/tools/consensus-image.test.js',
    'integration/providers/provider-image-tests.test.js',
    'integration/mcp-protocol/mcp-client-integration.test.js',
    'integration/performance/performance-consensus.test.js'
  ];
  
  let updatedCount = 0;
  
  for (const file of filesToCheck) {
    const filePath = path.join(testDir, file);
    try {
      if (await addImportToFile(filePath)) {
        updatedCount++;
      }
    } catch (error) {
      console.error(`Error updating ${file}:`, error.message);
    }
  }
  
  console.log(`\nUpdate complete! Updated ${updatedCount} files.`);
}

main().catch(console.error);