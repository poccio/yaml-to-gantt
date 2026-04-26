#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { start } from '../server/index.js';

const filePath = process.argv[2];

if (!filePath) {
  console.log('Usage: yaml-to-gantt <file.yaml>');
  console.log('');
  console.log('  Visualize a YAML roadmap as an interactive Gantt chart.');
  console.log('');
  console.log('Example:');
  console.log('  npx yaml-to-gantt roadmap.yaml');
  process.exit(1);
}

const absPath = resolve(filePath);

if (!existsSync(absPath)) {
  console.error(`Error: file not found: ${absPath}`);
  process.exit(1);
}

const server = await start(absPath);
const addr = server.address();
const url = `http://localhost:${addr.port}?file=${encodeURIComponent(absPath)}`;

console.log(`\n  yaml-to-gantt\n`);
console.log(`  Serving ${absPath}`);
console.log(`  ${url}\n`);
console.log(`  Watching for changes. Press Ctrl+C to stop.\n`);

const platform = process.platform;
try {
  if (platform === 'darwin') execSync(`open "${url}"`);
  else if (platform === 'win32') execSync(`start "" "${url}"`);
  else execSync(`xdg-open "${url}"`);
} catch {
  // Browser open failed silently — URL is printed, user can open manually
}
