import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sirv from 'sirv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function start(yamlPath, { port = 3847 } = {}) {
  const distDir = path.join(__dirname, '..', 'dist');
  const serveStatic = sirv(distDir, { single: true });

  const clients = new Set();
  let debounceTimer = null;

  fs.watch(yamlPath, () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      for (const res of clients) {
        res.write('data: reload\n\n');
      }
    }, 200);
  });

  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/api/yaml') {
      const content = fs.readFileSync(yamlPath, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/plain' });
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
    server.on('error', (err) => {
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
