import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import { DIST_DIR, start } from '../server/index.js';
import { moveTask } from '../server/moveTask.js';

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

function postJson(
  url: string,
  body: unknown,
  headers: http.OutgoingHttpHeaders = {},
): Promise<FetchResult> {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request(
      url,
      { method: 'POST', agent: false, headers: { 'Content-Type': 'application/json', ...headers } },
      (res) => {
        let text = '';
        res.on('data', (chunk: Buffer) => { text += chunk; });
        res.on('end', () => resolve({ status: res.statusCode!, body: text, headers: res.headers }));
      },
    );
    req.on('error', reject);
    req.end(payload);
  });
}

const MOVABLE_YAML = [
  'projects:',
  '  Alpha:',
  '    - name: One',
  '      start: 2025-01-01',
  '      end: 2025-01-05',
  '    - name: Two',
  '      start: 2025-01-10',
  '      end: 2025-01-12',
  '',
].join('\n');

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
    return `http://127.0.0.1:${port}`;
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

  it('versions /api/yaml by content', async () => {
    const origin = await serve(MOVABLE_YAML);

    const first = await fetchUrl(`${origin}/api/yaml`);
    const second = await fetchUrl(`${origin}/api/yaml`);
    expect(first.headers['x-yaml-version']).toMatch(/^[0-9a-f]{40}$/);
    expect(second.headers['x-yaml-version']).toBe(first.headers['x-yaml-version']);

    fs.writeFileSync(tmpFile!, MOVABLE_YAML + '# edited\n');
    const third = await fetchUrl(`${origin}/api/yaml`);
    expect(third.headers['x-yaml-version']).not.toBe(first.headers['x-yaml-version']);
  });

  describe('POST /api/move', () => {
    const move = { project: 'Alpha', index: 1, start: '2025-01-20', end: '2025-01-22' };

    /** Serves MOVABLE_YAML; returns what a well-behaved client would send. */
    async function setup() {
      const origin = await serve(MOVABLE_YAML);
      const version = (await fetchUrl(`${origin}/api/yaml`)).headers['x-yaml-version'] as string;
      return { origin, version, headers: { Origin: origin } };
    }

    it('moves a task and rewrites the file in place', async () => {
      const { origin, version, headers } = await setup();
      const inoBefore = fs.statSync(tmpFile!).ino;

      const res = await postJson(`${origin}/api/move`, { version, ...move }, headers);

      expect(res.status).toBe(204);
      expect(fs.readFileSync(tmpFile!, 'utf-8')).toBe(moveTask(MOVABLE_YAML, move));
      expect(fs.statSync(tmpFile!).ino).toBe(inoBefore);
    });

    it('accepts the localhost origin as well', async () => {
      const { origin, version } = await setup();
      const { port } = server!.address() as AddressInfo;

      const res = await postJson(`${origin}/api/move`, { version, ...move }, { Origin: `http://localhost:${port}` });
      expect(res.status).toBe(204);
    });

    it('refuses a file that is not valid UTF-8 with 422 and leaves its bytes alone', async () => {
      const bytes = Buffer.concat([Buffer.from('# caf'), Buffer.from([0xe9]), Buffer.from('\n' + MOVABLE_YAML)]);
      const origin = await serve('');
      fs.writeFileSync(tmpFile!, bytes);
      const version = (await fetchUrl(`${origin}/api/yaml`)).headers['x-yaml-version'] as string;

      const res = await postJson(`${origin}/api/move`, { version, ...move }, { Origin: origin });

      expect(res.status).toBe(422);
      expect(res.body).toBe('file is not valid UTF-8');
      expect(fs.readFileSync(tmpFile!).equals(bytes)).toBe(true);
    });

    it('moves a task in a file that starts with a BOM, keeping the BOM', async () => {
      const bom = '\uFEFF' + MOVABLE_YAML;
      const origin = await serve('');
      fs.writeFileSync(tmpFile!, bom);
      const version = (await fetchUrl(`${origin}/api/yaml`)).headers['x-yaml-version'] as string;

      const res = await postJson(`${origin}/api/move`, { version, ...move }, { Origin: origin });

      expect(res.status).toBe(204);
      expect(fs.readFileSync(tmpFile!, 'utf-8')).toBe(moveTask(bom, move));
      expect(fs.readFileSync(tmpFile!)[0]).toBe(0xef);
    });

    it('refuses a stale version with 409 and leaves the file alone', async () => {
      const { origin, version, headers } = await setup();
      const edited = MOVABLE_YAML + '# edited by hand\n';
      fs.writeFileSync(tmpFile!, edited);

      const res = await postJson(`${origin}/api/move`, { version, ...move }, headers);

      expect(res.status).toBe(409);
      expect(fs.readFileSync(tmpFile!, 'utf-8')).toBe(edited);
    });

    it('refuses a foreign or missing Origin with 403', async () => {
      const { origin, version } = await setup();

      const foreign = await postJson(`${origin}/api/move`, { version, ...move }, { Origin: 'http://evil.example' });
      const missing = await postJson(`${origin}/api/move`, { version, ...move });

      expect(foreign.status).toBe(403);
      expect(missing.status).toBe(403);
      expect(fs.readFileSync(tmpFile!, 'utf-8')).toBe(MOVABLE_YAML);
    });

    it('refuses a non-JSON body with 415', async () => {
      const { origin, version, headers } = await setup();

      const res = await postJson(`${origin}/api/move`, JSON.stringify({ version, ...move }), {
        ...headers,
        'Content-Type': 'text/plain',
      });

      expect(res.status).toBe(415);
      expect(fs.readFileSync(tmpFile!, 'utf-8')).toBe(MOVABLE_YAML);
    });

    it('answers malformed or oversized bodies without touching the file', async () => {
      const { origin, headers } = await setup();

      const broken = await postJson(`${origin}/api/move`, '{', headers);
      const wrongShape = await postJson(`${origin}/api/move`, '{ "index": "1" }', headers);
      const oversized = await postJson(`${origin}/api/move`, 'x'.repeat(70_000), headers);

      expect(broken.status).toBe(400);
      expect(wrongShape.status).toBe(400);
      expect(oversized.status).toBe(413);
      expect(fs.readFileSync(tmpFile!, 'utf-8')).toBe(MOVABLE_YAML);
    });

    it('answers a refused move with 422 and its message', async () => {
      const { origin, version, headers } = await setup();

      const res = await postJson(`${origin}/api/move`, { version, ...move, project: 'Nope' }, headers);

      expect(res.status).toBe(422);
      expect(res.headers['content-type']).toContain('text/plain');
      expect(res.body).toMatch(/not found/);
      expect(fs.readFileSync(tmpFile!, 'utf-8')).toBe(MOVABLE_YAML);
    });

    it('tells clients to reload after each move', async () => {
      const { origin, version, headers } = await setup();

      let received = '';
      const events = http.get(`${origin}/api/events`, { agent: false }, (res) => {
        res.on('data', (chunk: Buffer) => { received += chunk; });
      });
      const reloads = () => received.split('data: reload').length - 1;
      const waitForReloads = async (n: number) => {
        const deadline = Date.now() + 3000;
        while (reloads() < n && Date.now() < deadline) await new Promise((r) => setTimeout(r, 25));
        expect(reloads()).toBeGreaterThanOrEqual(n);
      };

      try {
        // The stream has to be registered before the write, or the reload is missed.
        await new Promise((r) => setTimeout(r, 100));
        expect((await postJson(`${origin}/api/move`, { version, ...move }, headers)).status).toBe(204);
        await waitForReloads(1);

        const next = (await fetchUrl(`${origin}/api/yaml`)).headers['x-yaml-version'] as string;
        const again = { ...move, index: 0, start: '2025-02-01', end: '2025-02-03' };
        expect((await postJson(`${origin}/api/move`, { version: next, ...again }, headers)).status).toBe(204);
        await waitForReloads(2);
      } finally {
        events.destroy();
      }
    });
  });

  it('listens on loopback only', async () => {
    await serve('projects: {}');
    expect((server!.address() as AddressInfo).address).toBe('127.0.0.1');
  });
});
