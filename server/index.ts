import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sirv from 'sirv';

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

  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/api/yaml') {
      const content = fs.readFileSync(yamlPath, 'utf-8');
      res.writeHead(200, {
        'Content-Type': 'text/plain',
        // The client refetches this on every SSE reload with a plain fetch(), so
        // a cached copy would replay the file it was just told had changed.
        'Cache-Control': 'no-store',
        // Which file this came from. The client prefers the `?file=` the CLI
        // builds, but that is gone the moment someone opens localhost/ by hand,
        // and only the server knows the answer. Percent-encoded because Node
        // writes header values as latin1 and would mangle an accented path.
        'X-Yaml-Path': encodeURIComponent(yamlPath),
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
        server.listen(currentPort);
      } else {
        reject(err);
      }
    });
    server.listen(currentPort, () => resolve(server));
  });
}
