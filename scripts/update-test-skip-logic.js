#!/usr/bin/env node

/**
 * Script to update test files to use the new apiKeyDetection utility
 * This will replace manual API key checks with the standardized utility
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mapping of old conditions to new testWithApiKeys configurations
const replacements = [
  {
    pattern: /it\.skipIf\(!hasOpenAI\)/g,
    replacement: "testWithApiKeys({ requiredProviders: ['OPENAI'], requireAll: true })"
  },
  {
    pattern: /it\.skipIf\(!hasXAI\)/g,
    replacement: "testWithApiKeys({ requiredProviders: ['XAI'], requireAll: true })"
  },
  {
    pattern: /it\.skipIf\(!hasGoogle\)/g,
    replacement: "testWithApiKeys({ requiredProviders: ['GOOGLE'], requireAll: true })"
  },
  {
    pattern: /it\.skipIf\(!hasAnyApiKey\)/g,
    replacement: "testWithApiKeys({ requiredProviders: ['OPENAI', 'XAI', 'GOOGLE'] })"
  },
  {
    pattern: /it\.skipIf\(!hasAnyMainProvider\)/g,
    replacement: "testWithApiKeys({ requiredProviders: ['OPENAI', 'XAI', 'GOOGLE'] })"
  },
  {
    pattern: /it\.skipIf\(\[hasOpenAI, hasXAI, hasGoogle\]\.filter\(Boolean\)\.length < 2\)/g,
    replacement: "testWithApiKeys({ requiredProviders: ['OPENAI', 'XAI', 'GOOGLE'], requireAll: false })"
  },
  {
    pattern: /it\.skipIf\(!hasOpenAI \|\| !hasXAI \|\| !hasGoogle\)/g,
    replacement: "testWithApiKeys({ requiredProviders: ['OPENAI', 'XAI', 'GOOGLE'], requireAll: true })"
  },
  {
    pattern: /it\.skipIf\(!hasAnyApiKey \|\| !\(hasOpenAI && hasGoogle\)\)/g,
    replacement: "testWithApiKeys({ requiredProviders: ['OPENAI', 'GOOGLE'], requireAll: true })"
  },
  {
    pattern: /describe\.skipIf\(!hasAnyApiKey\)/g,
    replacement: "testWithApiKeys({ requiredProviders: ['OPENAI', 'XAI', 'GOOGLE'] }).describe"
  }
];

async function updateFile(filePath) {
  console.log(`Updating ${filePath}...`);
  
  let content = await fs.readFile(filePath, 'utf-8');
  let modified = false;
  
  // Apply each replacement
  replacements.forEach(({ pattern, replacement }) => {
    const newContent = content.replace(pattern, replacement);
    if (newContent !== content) {
      content = newContent;
      modified = true;
    }
  });
  
  if (modified) {
    await fs.writeFile(filePath, content);
    console.log(`✓ Updated ${filePath}`);
  } else {
    console.log(`- No changes needed for ${filePath}`);
  }
}

async function main() {
  const testDir = path.join(__dirname, '..', 'tests');
  
  // Files to update
  const filesToUpdate = [
    'integration/providers/real-api-enhanced.test.js',
    'integration/tools/consensus-image.test.js',
    'integration/providers/provider-image-tests.test.js',
    'integration/mcp-protocol/mcp-client-integration.test.js',
    'integration/performance/performance-consensus.test.js',
    'integration/tools/continuation-flow.test.js',
    'integration/providers/new-providers-api.test.js'
  ];
  
  for (const file of filesToUpdate) {
    const filePath = path.join(testDir, file);
    try {
      await updateFile(filePath);
    } catch (error) {
      console.error(`Error updating ${file}:`, error.message);
    }
  }
  
  console.log('\nUpdate complete!');
}

main().catch(console.error);