import crypto from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sirv from 'sirv';
import { MoveRefused, moveTask } from './moveTask.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * The built client, located by walking up to the package root instead of
 * counting `..` hops. This module runs from `server/` under vitest and from
 * `dist-server/server/` in the tarball, so any fixed depth is correct in exactly
 * one of the two and silently serves nothing in the other.
 */
function findDistDir(from: string): string {
  let dir = from;
  while (!fs.existsSync(path.join(dir, 'package.json'))) {
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`no package.json above ${from}; cannot locate dist/`);
    dir = parent;
  }
  return path.join(dir, 'dist');
}

export const DIST_DIR = findDistDir(__dirname);

const MAX_BODY_BYTES = 64 * 1024;

function reply(res: http.ServerResponse, status: number, message?: string): void {
  if (message === undefined) {
    res.writeHead(status).end();
    return;
  }
  res.writeHead(status, { 'Content-Type': 'text/plain' }).end(message);
}

/** Resolves to the body, or `null` once it passes the cap. */
function readBody(req: http.IncomingMessage): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      // Keep draining past the cap instead of destroying the socket: the 413 has
      // to reach a client that is still mid-write.
      if (size <= MAX_BODY_BYTES) chunks.push(chunk);
    });
    req.on('end', () => resolve(size > MAX_BODY_BYTES ? null : Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function isMoveBody(v: unknown): v is { version: string; project: string; index: number; start: string; end: string } {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.version === 'string' &&
    typeof o.project === 'string' &&
    typeof o.start === 'string' &&
    typeof o.end === 'string' &&
    Number.isInteger(o.index) &&
    (o.index as number) >= 0
  );
}

interface StartOptions {
  port?: number;
  /**
   * Static root. Overridable so tests can serve a fixture tree they own instead
   * of build output that may or may not be there. sirv snapshots the directory
   * as it is constructed, so write the fixture before calling `start`.
   */
  distDir?: string;
}

export function start(
  yamlPath: string,
  { port = 3847, distDir = DIST_DIR }: StartOptions = {},
): Promise<http.Server> {
  // sirv sends no Cache-Control, leaving browsers free to reuse index.html without
  // revalidating. It is the only unhashed name here, so a stale copy pins the
  // previous build's bundle and an upgraded package serves the old app. `etag` is
  // what makes the revalidation a 304 — sirv honors If-None-Match alone.
  const serveStatic = sirv(distDir, {
    single: true,
    etag: true,
    setHeaders(res, pathname) {
      // The extension is part of the test, not the `/assets/` prefix alone:
      // `single` answers an extensionless miss with index.html, so a bare prefix
      // would pin *HTML* under that URL for a year.
      const isHashed = /^\/assets\/.+\.[a-z0-9]+$/i.test(pathname);
      res.setHeader(
        'Cache-Control',
        isHashed
          ? 'public, max-age=31536000, immutable'
          : 'no-cache',
      );
    },
  });

  const clients = new Set<http.ServerResponse>();
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  fs.watch(yamlPath, () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      for (const res of clients) {
        res.write('data: reload\n\n');
      }
    }, 200);
  });

  const sha1 = (bytes: Buffer) => crypto.createHash('sha1').update(bytes).digest('hex');

  async function handleMove(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // A page on any other origin can POST here from the user's browser: a
    // cross-site form needs no CORS preflight, and DNS rebinding makes an attacker's
    // hostname resolve to 127.0.0.1. Browsers always attach `Origin` to a POST, so
    // requiring one of our own origins shuts both out. The port is read per request
    // because the EADDRINUSE retry may have moved it.
    const { port } = server.address() as AddressInfo;
    const origin = req.headers.origin;
    if (origin !== `http://localhost:${port}` && origin !== `http://127.0.0.1:${port}`) {
      req.resume();
      return reply(res, 403, 'forbidden origin');
    }
    if (!/^application\/json\s*(;|$)/i.test(req.headers['content-type'] ?? '')) {
      req.resume();
      return reply(res, 415, 'expected application/json');
    }
    const raw = await readBody(req);
    if (raw === null) return reply(res, 413, 'body too large');

    let body: unknown;
    try {
      body = JSON.parse(raw.toString('utf-8'));
    } catch {
      return reply(res, 400, 'malformed JSON');
    }
    if (!isMoveBody(body)) return reply(res, 400, 'invalid move fields');

    const bytes = fs.readFileSync(yamlPath);
    if (sha1(bytes) !== body.version) return reply(res, 409, 'file changed on disk');

    // A lossy decode would turn every stray byte into U+FFFD on write-back, so a
    // file that does not survive the round trip is refused, not rewritten.
    const text = bytes.toString('utf-8');
    if (!Buffer.from(text).equals(bytes)) return reply(res, 422, 'file is not valid UTF-8');

    try {
      const { version: _version, ...move } = body;
      // In place, never write-then-rename: `fs.watch` follows the inode, so a
      // renamed file would leave it watching the old one and no reload would fire.
      fs.writeFileSync(yamlPath, moveTask(text, move));
    } catch (err) {
      if (err instanceof MoveRefused) return reply(res, 422, err.message);
      throw err;
    }
    reply(res, 204);
  }

  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/api/move') {
      handleMove(req, res).catch((err) => {
        console.error('POST /api/move failed:', err);
        if (!res.headersSent) reply(res, 500, 'internal error');
        else res.destroy();
      });
      return;
    }

    if (req.method === 'GET' && req.url === '/api/yaml') {
      // Hashed and served from one read, so the version always names these bytes.
      const content = fs.readFileSync(yamlPath);
      res.writeHead(200, {
        'Content-Type': 'text/plain',
        // The client refetches this on every SSE reload with a plain fetch(), so
        // a cached copy would replay the file it was just told had changed.
        'Cache-Control': 'no-store',
        // Which file this came from. The client prefers the `?file=` the CLI
        // builds, but that is gone the moment someone opens the server root by hand,
        // and only the server knows the answer. Percent-encoded because Node
        // writes header values as latin1 and would mangle an accented path.
        'X-Yaml-Path': encodeURIComponent(yamlPath),
        // What a move must echo back so the server can tell the chart is showing
        // a file that has since been edited.
        'X-Yaml-Version': sha1(content),
      });
      res.end(content);
      return;
    }

    if (req.method === 'GET' && req.url === '/api/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      res.write('\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    serveStatic(req, res);
  });

  return new Promise((resolve, reject) => {
    let currentPort = port;
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        currentPort++;
        server.listen(currentPort, '127.0.0.1');
      } else {
        reject(err);
      }
    });
    server.listen(currentPort, '127.0.0.1', () => resolve(server));
  });
}
