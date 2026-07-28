#!/usr/bin/env node

import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { start } from '../server/index.js';

const args = process.argv.slice(2);
const noOpen = args.includes('--no-open');
const noAssigneeFilter = args.includes('--no-assignee-filter');
const filePath = args.find((a) => !a.startsWith('--'));

if (!filePath) {
  console.log('Usage: yaml-to-gantt <file.yaml> [options]');
  console.log('');
  console.log('  Visualize a YAML roadmap as an interactive Gantt chart.');
  console.log('');
  console.log('Options:');
  console.log('  --no-open              Start the server without opening a browser');
  console.log('  --no-assignee-filter   Hide the assignee filter row to save vertical space');
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

if (!statSync(absPath).isFile()) {
  console.error(`Error: not a file: ${absPath}`);
  process.exit(1);
}

const server = await start(absPath);
const addr = server.address() as { port: number };
const url =
  `http://localhost:${addr.port}?file=${encodeURIComponent(absPath)}` +
  (noAssigneeFilter ? '&assigneeFilter=off' : '');

console.log(`\n  yaml-to-gantt\n`);
console.log(`  Serving ${absPath}`);
console.log(`  ${url}\n`);
console.log(`  Watching for changes. Press Ctrl+C to stop.\n`);

if (!noOpen) {
  const platform = process.platform;
  try {
    if (platform === 'darwin') execSync(`open "${url}"`);
    else if (platform === 'win32') execSync(`start "" "${url}"`);
    else execSync(`xdg-open "${url}"`);
  } catch {
    // Browser open failed silently — URL is printed, user can open manually
  }
}
