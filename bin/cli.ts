#!/usr/bin/env node

import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { start } from '../server/index.js';
import { parseCliArgs, USAGE } from './cliArgs.js';

const command = parseCliArgs(process.argv.slice(2));

if (command.kind === 'error') {
  console.error(`Error: ${command.message}`);
  console.error(`Run 'yaml-to-gantt --help' for usage.`);
  process.exit(1);
}

if (command.kind === 'usage') {
  console.log(USAGE);
  process.exit(command.exitCode);
}

const { file, noOpen, noAssigneeFilter } = command;
const absPath = resolve(file);

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
    // Opening is a convenience; the URL is printed above either way
  }
}
