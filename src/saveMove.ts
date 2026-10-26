/** The `POST /api/move` body; `version` is the `X-Yaml-Version` of the roadmap on screen. */
export interface MoveRequest {
  version: string;
  project: string;
  index: number;
  start: string;
  end: string;
}

interface SaveMoveDeps {
  /** Refetches the served file; resolves `true` only if a new roadmap parsed. */
  reload: () => Promise<boolean>;
  notify: (message: string) => void;
}

/**
 * Resolves `true` only once the reload has put the saved file on screen:
 * `GanttChart` blocks drags after a `true` until new `tasks` arrive, so a
 * `true` with nothing behind it would leave the chart undraggable.
 */
export async function saveMove(move: MoveRequest, { reload, notify }: SaveMoveDeps): Promise<boolean> {
  let status: number;
  let message: string;
  try {
    const r = await fetch('/api/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(move),
    });
    if (r.ok) return reload();
    status = r.status;
    message = await r.text();
  } catch {
    notify('Could not save: server unreachable');
    return false;
  }
  if (status === 409) {
    notify('File changed on disk — try again');
    void reload();
    return false;
  }
  notify(message);
  return false;
}
