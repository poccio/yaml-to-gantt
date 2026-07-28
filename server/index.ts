import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sirv from 'sirv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** The built client, one level up from the compiled server in the tarball. */
const DIST_DIR = path.join(__dirname, '..', 'dist');

interface StartOptions {
  port?: number;
  /**
   * Static root. Overridable so tests can serve a fixture tree they own instead
   * of the real build output, whose presence and contents depend on whether the
   * checkout has been built. sirv snapshots the directory as it is constructed,
   * so whatever is to be served must be on disk before `start` is called.
   */
  distDir?: string;
}

export function start(
  yamlPath: string,
  { port = 3847, distDir = DIST_DIR }: StartOptions = {},
): Promise<http.Server> {
  // sirv sends no Cache-Control, leaving browsers free to reuse index.html without
  // revalidating. It is the only unhashed name here, so a stale copy pins the
  // previous build's bundle and an upgraded package serves the old app.
  const serveStatic = sirv(distDir, {
    single: true,
    etag: true,
    setHeaders(res, pathname) {
      res.setHeader(
        'Cache-Control',
        pathname.startsWith('/assets/')
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
