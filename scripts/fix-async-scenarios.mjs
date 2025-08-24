#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filePath = path.join(path.dirname(__dirname), 'tests/integration/async-workflow/async-scenarios.test.js');
let content = fs.readFileSync(filePath, 'utf8');

// Fix the malformed client.callTool calls
// Pattern 1: Fix the basic structure
content = content.replace(/await client\.callTool\({\s*\n\s*\n\s*name:/g, 
  'await client.callTool({\n            name:');

// Pattern 2: Remove extra closing braces and headers
content = content.replace(/}\s*}\s*}, {\s*headers: {\s*'mcp-session-id': sessionId\s*}\s*}\);/g, 
  '}\n          });');

// Pattern 3: Fix client.request that wasn't converted
content = content.replace(/client\.request\({/g, 'client.callTool({');

// Pattern 4: Clean up the arguments closing
content = content.replace(/}\s*}\s*}\);/g, '}\n          });');

// Pattern 5: Fix indentation for arguments
content = content.replace(/arguments: {\s*\n\s*prompt:/g, 
  'arguments: {\n                prompt:');

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed async-scenarios.test.js');