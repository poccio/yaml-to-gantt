/** @vitest-environment jsdom */
import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import GanttChart from '../src/GanttChart';
import { DARK } from '../src/themes';
import type { Task } from '../src/parseYaml';

// Pinned for the same reason tests/timeline.test.ts pins it: a UTC-only run
// cannot catch a local-vs-UTC mix-up in the day grid these offsets sit on.
const ZONE = 'America/New_York';
let originalTZ: string | undefined;

beforeAll(() => {
  originalTZ = process.env.TZ;
  process.env.TZ = ZONE;
});

afterAll(() => {
  if (originalTZ === undefined) delete process.env.TZ;
  else process.env.TZ = originalTZ;
});

function task(overrides: Partial<Task> = {}): Task {
  return {
    project: 'Product Launch',
    name: 'Market research',
    start: '2026-07-01',
    end: '2026-07-11',
    assignees: [],
    ...overrides,
  };
}

// The fixture's grid, hand-derived:
//   rangeStart = Jul 1 − RANGE_PAD(4) = Sat Jun 27 2026, totalDays = 21
//   today is pinned to Jul 28 2026, so todayRawOffset = 31
//   scrollLeft = (31 − TODAY_LEAD_IN(7)) * DAY_W(40) = 960
const FOCUSED_SCROLL = 960;

// Adding a task starting Jun 21 moves rangeStart to Wed Jun 17 — ten days
// earlier — so every offset grows by 10 and the viewport must follow right by
// 10 * DAY_W = 400 to keep the same date at its left edge.
const REANCHOR_SHIFT = 400;

/**
 * jsdom supplies neither of the two things the latch reads. `clientWidth` is a
 * zero-returning getter on the prototype; ResizeObserver is absent entirely.
 * Both are restored in afterEach — a leaked prototype getter would corrupt
 * every later test in the file.
 */
function installLayoutStubs(initialWidth: number) {
  let width = initialWidth;
  const observers: Array<(w: number) => void> = [];

  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => width,
  });

  class FakeResizeObserver {
    constructor(private cb: (entries: Array<{ contentRect: { width: number } }>) => void) {
      observers.push((w) => this.cb([{ contentRect: { width: w } }]));
    }
    observe() {}
    disconnect() {}
  }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = FakeResizeObserver;

  return {
    /** Grow the element and fire the observer, as a real reveal would. */
    resizeTo(w: number) {
      width = w;
      act(() => { observers.forEach((fire) => fire(w)); });
    },
    restore() {
      if (original) Object.defineProperty(HTMLElement.prototype, 'clientWidth', original);
      else delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientWidth;
      delete (globalThis as unknown as Record<string, unknown>).ResizeObserver;
    },
  };
}

let host: HTMLDivElement;

beforeEach(() => {
  // Date only. Faking timers wholesale would also capture the popover's
  // setTimeout, which nothing here drives.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 6, 28));
  host = document.createElement('div');
  document.body.appendChild(host);
});

afterEach(() => {
  render(null, host);
  host.remove();
  vi.useRealTimers();
});

/** The scrollable div GanttChart attaches its ref to is the component's root. */
function scroller(): HTMLDivElement {
  return host.firstElementChild as HTMLDivElement;
}

function draw(tasks: Task[]) {
  act(() => {
    render(<GanttChart tasks={tasks} selectedAssignees={null} theme={DARK} />, host);
  });
}

describe('initial scroll latch', () => {
  // Opening on rangeStart buries today off-screen for any roadmap with history.
  test('focuses today on a mount that already has layout', () => {
    const stubs = installLayoutStubs(1182);
    try {
      draw([task()]);
      expect(scroller().scrollLeft).toBe(FOCUSED_SCROLL);
    } finally {
      stubs.restore();
    }
  });

  // The case that discriminates. A chart mounted inside `display: none` has no
  // layout box, so the scrollLeft assignment is silently discarded — an
  // embedder that reveals it later (a reveal.js slide, a tab, an accordion)
  // was left stuck at rangeStart. A mount-only latch passes the test above and
  // fails this one; that is the whole reason this test exists.
  test('recovers on a mount that is revealed later', () => {
    const stubs = installLayoutStubs(0);
    try {
      draw([task()]);
      expect(scroller().scrollLeft).toBe(0);

      stubs.resizeTo(1182);

      expect(scroller().scrollLeft).toBe(FOCUSED_SCROLL);
    } finally {
      stubs.restore();
    }
  });

  // An SSE hot-reload re-renders with a fresh (but equal) task array, which
  // gives computeRange a new rangeStart *object* at the same date. Neither the
  // latch nor the re-anchor may move the user out of what they were reading.
  test('does not re-fire when the YAML reloads unchanged', () => {
    const stubs = installLayoutStubs(1182);
    try {
      draw([task()]);
      scroller().scrollLeft = 3000;

      draw([task()]);

      expect(scroller().scrollLeft).toBe(3000);
    } finally {
      stubs.restore();
    }
  });
});

describe('rangeStart re-anchor', () => {
  // Holding scroll across a reload means holding the *date* at the left edge,
  // not the pixel. A reload that introduces an earlier task moves the origin
  // and shifts every offset right, while scrollLeft — a DOM value untouched by
  // the render — keeps pointing at what is now an earlier day.
  test('follows the grid when a new earliest task moves the origin', () => {
    const stubs = installLayoutStubs(1182);
    try {
      draw([task()]);
      scroller().scrollLeft = 3000;

      draw([task(), task({ name: 'Earlier', start: '2026-06-21', end: '2026-06-25' })]);

      expect(scroller().scrollLeft).toBe(3000 + REANCHOR_SHIFT);
    } finally {
      stubs.restore();
    }
  });
});
