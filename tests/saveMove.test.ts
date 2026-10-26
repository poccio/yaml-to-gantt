import { describe, test, expect, vi, afterEach } from 'vitest';
import { saveMove } from '../src/saveMove';

const MOVE = { version: 'abc', project: 'Launch', index: 2, start: '2025-07-04', end: '2025-07-09' };

function respond(status: number, text = '') {
  const fetchMock = vi.fn(async () => new Response(status === 204 ? null : text, { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function deps(reloaded = true) {
  return { reload: vi.fn(async () => reloaded), notify: vi.fn() };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('saveMove', () => {
  test('POSTs the move as JSON to /api/move', async () => {
    const fetchMock = respond(204);
    await saveMove(MOVE, deps());
    expect(fetchMock).toHaveBeenCalledWith('/api/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(MOVE),
    });
  });

  test('a saved move resolves true once the reload lands', async () => {
    respond(204);
    const d = deps(true);
    await expect(saveMove(MOVE, d)).resolves.toBe(true);
    expect(d.reload).toHaveBeenCalledOnce();
    expect(d.notify).not.toHaveBeenCalled();
  });

  test('a saved move resolves false when the reload fails', async () => {
    respond(204);
    await expect(saveMove(MOVE, deps(false))).resolves.toBe(false);
  });

  test('a stale version reloads and tells the user to retry', async () => {
    respond(409, 'file changed on disk');
    const d = deps();
    await expect(saveMove(MOVE, d)).resolves.toBe(false);
    expect(d.reload).toHaveBeenCalledOnce();
    expect(d.notify).toHaveBeenCalledWith('File changed on disk — try again');
  });

  test('a refused move shows the server message without reloading', async () => {
    respond(422, 'task has no plain start value');
    const d = deps();
    await expect(saveMove(MOVE, d)).resolves.toBe(false);
    expect(d.reload).not.toHaveBeenCalled();
    expect(d.notify).toHaveBeenCalledWith('task has no plain start value');
  });

  test('an unreachable server says so', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const d = deps();
    await expect(saveMove(MOVE, d)).resolves.toBe(false);
    expect(d.notify).toHaveBeenCalledWith('Could not save: server unreachable');
  });
});
