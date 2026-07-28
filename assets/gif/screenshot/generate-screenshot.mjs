#!/usr/bin/env node
//
// The headless-browser step of the demo GIF pipeline: boots the project's own
// server, drives Chromium, opens a task's description popover, and screenshots
// the chart. Normally invoked by generate-screenshot.sh, which runs `pnpm build`
// first — the server serves dist/, not src/, so a direct run shows a stale app.
//
// Playwright's browser binary is not a devDependency; install it once:
//   pnpm exec playwright install chromium
//
// Flags, all optional, defaults just below: --yaml --out --theme --task
// --display --width --height --scale. Paths resolve relative to this file.
// --display sets the toolbar label independently of --yaml, so the frame reads
// "roadmap.yaml" whatever path was actually rendered. --scale is 2 for
// crispness; ffmpeg scales back down to 1280x720.

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { start } from '../../../server/index.js';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error(
    'Playwright is required. Install it with:\n' +
    '  pnpm add -D playwright && pnpm exec playwright install chromium'
  );
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const argv = process.argv.slice(2);
const args = {};
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[i + 1];
}

const YAML = path.resolve(__dirname, args.yaml ?? '../roadmap.yaml');
const OUT = path.resolve(__dirname, args.out ?? 'screenshot-dark.png');
const THEME = args.theme === 'light' ? 'light' : 'dark';
const TASK = 'task' in args ? args.task : 'Design';
const DISPLAY = args.display ?? 'roadmap.yaml';
const WIDTH = Number(args.width ?? 1280);
const HEIGHT = Number(args.height ?? 720);
const SCALE = Number(args.scale ?? 2);

const server = await start(YAML, { port: 0 }); // port 0 → OS-assigned free port
const base = `http://localhost:${server.address().port}`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: SCALE,
    colorScheme: THEME,
  });

  await page.goto(`${base}?file=${encodeURIComponent(DISPLAY)}`);

  await page.waitForTimeout(800);

  if (TASK) {
    // Open the task-description popover by hovering its "?" marker (the marker
    // button carries aria-label="Task details"). If the task isn't in this YAML,
    // don't fail the pipeline — just capture the chart without the popover.
    try {
      const label = page.getByText(TASK, { exact: true });
      await label.waitFor({ timeout: 8000 });
      const marker = label.locator('xpath=following-sibling::button[@aria-label="Task details"]');
      await marker.hover();
      await page.waitForTimeout(350);
    } catch {
      console.warn(`Task "${TASK}" not found — capturing chart without popover.`);
    }
  }

  await page.screenshot({ path: OUT });
  console.log(`Wrote ${OUT}`);
} finally {
  await browser.close();
  server.close();
}

process.exit(0);
