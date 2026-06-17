#!/usr/bin/env node
//
// generate-screenshot.mjs
// -----------------------------------------------------------------------------
// Generates the static "result" frame used by the demo GIF pipeline — by
// default assets/gif/screenshot/screenshot-dark.png, the chart image the demo
// GIF crossfades into. Usually invoked via generate-screenshot.sh (which runs
// `pnpm build` first); this file is the headless-browser step.
//
// It boots the project's own server (server/index.js) to serve a YAML file,
// drives a headless Chromium via Playwright, hovers a task's "?" marker to open
// the description popover, and screenshots the page.
//
// One-time setup (the npm package is a devDependency; the browser binary is not,
// so it must be installed once):
//   pnpm add -D playwright && pnpm exec playwright install chromium
//
// The server serves the built app, so build first if you changed src/:
//   pnpm build
//
// Usage (run from anywhere; paths resolve relative to this file):
//   node assets/gif/screenshot/generate-screenshot.mjs
//   node assets/gif/screenshot/generate-screenshot.mjs \
//     --yaml ../roadmap.yaml --out screenshot-dark.png \
//     --theme dark --task Design --display roadmap.yaml
//
// Flags (all optional):
//   --yaml     YAML file to render        (default: ../roadmap.yaml — the shared source)
//   --out      output PNG path            (default: screenshot-dark.png, next to this script)
//   --theme    dark | light               (default: dark)
//   --task     task name whose popover to open; '' to skip   (default: Design)
//   --display  toolbar path label (?file=)(default: roadmap.yaml)
//   --width    viewport width  px         (default: 1280)
//   --height   viewport height px         (default: 720)
//   --scale    deviceScaleFactor          (default: 2 — crisper; ffmpeg scales to 1280x720)
// -----------------------------------------------------------------------------

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

// Minimal --flag value parser.
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

  // Let the chart render.
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
