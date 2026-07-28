import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { DIST_DIR, start } from '../server/index.js';

interface FetchResult {
  status: number;
  body: string;
  headers: http.IncomingHttpHeaders;
}

// `agent: false` so each response closes its socket. Node's default agent keeps
// it alive, and afterEach's server.close() then waits on the idle connection.
function fetchUrl(url: string, headers: http.OutgoingHttpHeaders = {}): Promise<FetchResult> {
  return new Promise((resolve, reject) => {
    http.get(url, { agent: false, headers }, (res) => {
      let body = '';
      res.on('data', (chunk: Buffer) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode!, body, headers: res.headers }));
    }).on('error', reject);
  });
}

describe('server', () => {
  let server: http.Server | undefined;
  let tmpFile: string | undefined;

  // A stand-in for the built client, so these tests never touch the real dist/.
  // sirv snapshots the tree while `start` constructs it, so it is written up front.
  let distDir: string;
  const HASHED_ASSET = 'assets/index-abc123.js';

  beforeAll(() => {
    distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yaml-to-gantt-dist-'));
    fs.mkdirSync(path.join(distDir, 'assets'));
    fs.writeFileSync(path.join(distDir, 'index.html'), '<!doctype html><title>fixture</title>');
    fs.writeFileSync(path.join(distDir, HASHED_ASSET), '// fixture\n');
  });

  afterAll(() => {
    fs.rmSync(distDir, { recursive: true, force: true });
  });

  afterEach(async () => {
    if (server) await new Promise<void>((r) => server!.close(() => r()));
    if (tmpFile) try { fs.unlinkSync(tmpFile); } catch {}
  });

  function createTmpYaml(content: string, name?: string): string {
    tmpFile = path.join(os.tmpdir(), name ?? `yaml-to-gantt-test-${Date.now()}.yaml`);
    fs.writeFileSync(tmpFile, content);
    return tmpFile;
  }

  /** Serves `content` on an ephemeral port; returns the origin to fetch from. */
  async function serve(content: string, name?: string): Promise<string> {
    server = await start(createTmpYaml(content, name), { port: 0, distDir });
    const { port } = server.address() as { port: number };
    return `http://localhost:${port}`;
  }

  // Every other test injects `distDir`, so this is the only cover on the default —
  // which fails silently, serving 404s, and cannot be found by counting `..` hops
  // because the emitted server sits a directory deeper than this source.
  it('defaults its static root to the package dist/', () => {
    const packageRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
    expect(DIST_DIR).toBe(path.join(packageRoot, 'dist'));
  });

  it('serves YAML file at /api/yaml', async () => {
    const yamlContent = 'projects:\n  Test:\n    - name: T1\n      start: 2025-01-01\n      end: 2025-01-05\n      assignees: []\n';
    const origin = await serve(yamlContent);

    const res = await fetchUrl(`${origin}/api/yaml`);
    expect(res.status).toBe(200);
    expect(res.body).toBe(yamlContent);
    expect(res.headers['content-type']).toBe('text/plain');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('names the file it is serving on /api/yaml', async () => {
    // Accented on purpose: Node writes header values as latin1, so an unencoded
    // path outside that range arrives mangled.
    const origin = await serve('projects: {}', 'yaml-to-gantt-tëst piano.yaml');

    const res = await fetchUrl(`${origin}/api/yaml`);
    expect(res.headers['x-yaml-path']).toBe(encodeURIComponent(tmpFile!));
    expect(decodeURIComponent(res.headers['x-yaml-path'] as string)).toBe(tmpFile);
  });

  it('revalidates index.html and lets hashed assets be cached hard', async () => {
    const origin = await serve('projects: {}');

    // Unhashed: a browser reusing it unasked pins the previous build's bundle.
    const index = await fetchUrl(`${origin}/`);
    expect(index.status).toBe(200);
    expect(index.headers['cache-control']).toBe('no-cache');

    // Content-hashed: a new build is a new name, so this one can be kept forever.
    const hashed = await fetchUrl(`${origin}/${HASHED_ASSET}`);
    expect(hashed.status).toBe(200);
    expect(hashed.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('does not pin the SPA fallback served under /assets/', async () => {
    const origin = await serve('projects: {}');

    // `single` answers an extensionless miss with index.html, so keying the
    // immutable header off the `/assets/` prefix alone would pin HTML for a year.
    const fallback = await fetchUrl(`${origin}/assets/not-a-real-file`);
    expect(fallback.status).toBe(200);
    expect(fallback.headers['content-type']).toContain('text/html');
    expect(fallback.headers['cache-control']).toBe('no-cache');
  });

  it('answers a revalidation of index.html with 304', async () => {
    const origin = await serve('projects: {}');

    // Drop `etag: true` and `no-cache` costs a full 200 on every reload.
    const first = await fetchUrl(`${origin}/`);
    expect(first.headers['etag']).toMatch(/^W\/"\d+-\d+"$/);

    const revalidated = await fetchUrl(`${origin}/`, { 'If-None-Match': first.headers['etag']! });
    expect(revalidated.status).toBe(304);
    expect(revalidated.body).toBe('');
  });

  it('returns SSE headers at /api/events', async () => {
    const origin = await serve('projects: {}');

    const res = await new Promise<{ status: number; headers: http.IncomingHttpHeaders }>((resolve, reject) => {
      http.get(`${origin}/api/events`, (res) => {
        resolve({ status: res.statusCode!, headers: res.headers });
        res.destroy();
      }).on('error', reject);
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/event-stream');
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.headers['connection']).toBe('keep-alive');
  });

  it('starts on a specific port', async () => {
    await serve('projects: {}');
    const { port } = server!.address() as { port: number };
    expect(typeof port).toBe('number');
    expect(port).toBeGreaterThan(0);
  });
});
