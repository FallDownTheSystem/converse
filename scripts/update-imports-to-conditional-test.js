#!/usr/bin/env node

/**
 * Script to update imports from apiKeyDetection.js to conditionalTest.js
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function updateFile(filePath) {
  console.log(`Updating imports in ${filePath}...`);
  
  let content = await fs.readFile(filePath, 'utf-8');
  
  // Replace the import statement
  const newContent = content.replace(
    /from '\.\.\/\.\.\/utils\/apiKeyDetection\.js'/g,
    "from '../../utils/conditionalTest.js'"
  );
  
  if (newContent !== content) {
    await fs.writeFile(filePath, newContent);
    console.log(`✓ Updated ${filePath}`);
    return true;
  } else {
    console.log(`- No changes needed for ${filePath}`);
    return false;
  }
}

async function main() {
  const testDir = path.join(__dirname, '..', 'tests');
  
  // Files to update
  const filesToUpdate = [
    'integration/providers/real-api.test.js',
    'integration/providers/real-api-enhanced.test.js',
    'integration/tools/consensus-image.test.js',
    'integration/providers/provider-image-tests.test.js',
    'integration/mcp-protocol/mcp-client-integration.test.js',
    'integration/performance/performance-consensus.test.js',
    'integration/tools/continuation-flow.test.js',
    'integration/providers/new-providers-api.test.js'
  ];
  
  let updatedCount = 0;
  
  for (const file of filesToUpdate) {
    const filePath = path.join(testDir, file);
    try {
      if (await updateFile(filePath)) {
        updatedCount++;
      }
    } catch (error) {
      console.error(`Error updating ${file}:`, error.message);
    }
  }
  
  console.log(`\nUpdate complete! Updated ${updatedCount} files.`);
}

main().catch(console.error);