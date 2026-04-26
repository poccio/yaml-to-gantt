import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { start } from '../server/index.js';

function fetch(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    }).on('error', reject);
  });
}

describe('server', () => {
  let server;
  let tmpFile;

  afterEach(async () => {
    if (server) await new Promise((r) => server.close(r));
    if (tmpFile) try { fs.unlinkSync(tmpFile); } catch {}
  });

  function createTmpYaml(content) {
    tmpFile = path.join(os.tmpdir(), `yaml-to-gantt-test-${Date.now()}.yaml`);
    fs.writeFileSync(tmpFile, content);
    return tmpFile;
  }

  it('serves YAML file at /api/yaml', async () => {
    const yamlContent = 'projects:\n  Test:\n    - name: T1\n      start: 2025-01-01\n      end: 2025-01-05\n      assignees: []\n';
    const filePath = createTmpYaml(yamlContent);
    server = await start(filePath, { port: 0 });
    const addr = server.address();

    const res = await fetch(`http://localhost:${addr.port}/api/yaml`);
    expect(res.status).toBe(200);
    expect(res.body).toBe(yamlContent);
    expect(res.headers['content-type']).toBe('text/plain');
  });

  it('returns SSE headers at /api/events', async () => {
    const filePath = createTmpYaml('projects: {}');
    server = await start(filePath, { port: 0 });
    const addr = server.address();

    const res = await new Promise((resolve, reject) => {
      http.get(`http://localhost:${addr.port}/api/events`, (res) => {
        resolve({ status: res.statusCode, headers: res.headers });
        res.destroy();
      }).on('error', reject);
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/event-stream');
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.headers['connection']).toBe('keep-alive');
  });

  it('starts on a specific port', async () => {
    const filePath = createTmpYaml('projects: {}');
    server = await start(filePath, { port: 0 });
    const addr = server.address();
    expect(typeof addr.port).toBe('number');
    expect(addr.port).toBeGreaterThan(0);
  });
});
