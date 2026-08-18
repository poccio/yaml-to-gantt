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
//   scrollLeft = (31 − TODAY_LEAD_IN(7)) * BASE_DAY_W(40) = 960
const FOCUSED_SCROLL = 960;

// Adding a task starting Jun 21 moves rangeStart to Wed Jun 17 — ten days
// earlier — so every offset grows by 10 and the viewport must follow right by
// 10 * BASE_DAY_W = 400 to keep the same date at its left edge.
const REANCHOR_SHIFT = 400;

/**
 * jsdom supplies neither thing the latch reads: `clientWidth` is a zero-returning
 * prototype getter, ResizeObserver is absent. Both must be restored — a leaked
 * prototype getter corrupts every later test in the file.
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
  // Date only: faking timers wholesale also captures the popover's setTimeout,
  // which nothing here drives.
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

/** GanttChart's ref is on its root div, which is the scrollable one. */
function scroller(): HTMLDivElement {
  return host.firstElementChild as HTMLDivElement;
}

interface DrawOpts {
  /** Defaults to the projects the tasks themselves name, in first-seen order. */
  projects?: string[];
  selectedAssignees?: Set<string> | null;
  hideEmptyProjects?: boolean;
}

function draw(tasks: Task[], opts: DrawOpts = {}) {
  act(() => {
    render(
      <GanttChart
        tasks={tasks}
        projects={opts.projects ?? [...new Set(tasks.map(t => t.project))]}
        selectedAssignees={opts.selectedAssignees ?? null}
        hideEmptyProjects={opts.hideEmptyProjects ?? false}
        theme={DARK}
      />,
      host,
    );
  });
}

/** Header line, header dot and the full-height bar all carry `data-today`. */
function todayMarkerCount(): number {
  return scroller().querySelectorAll('[data-today]').length;
}

function todayBar(): HTMLElement {
  return scroller().querySelector('[data-today="bar"]') as HTMLElement;
}

function scrollTo(x: number) {
  act(() => {
    scroller().scrollLeft = x;
    scroller().dispatchEvent(new Event('scroll'));
  });
}

/** jsdom reports the container at x 0, so clientX is LABEL_W + timeline x. */
function hoverAt(clientX: number) {
  act(() => {
    scroller().dispatchEvent(new MouseEvent('mousemove', { clientX, bubbles: true }));
  });
}

function hoverPill(): HTMLElement {
  return scroller().querySelector('[data-hover-pill]') as HTMLElement;
}

/** One element per rendered project, header row first inside each. */
function projectGroups(): HTMLElement[] {
  return [...scroller().children[1].children] as HTMLElement[];
}

/** The rows of the single project the fixtures produce: header row first. */
function rows(): HTMLElement[] {
  return [...projectGroups()[0].children] as HTMLElement[];
}

/** The header label of each rendered project, in render order. */
function projectNames(): string[] {
  return projectGroups().map(g => g.querySelector('span')!.textContent!);
}

function cellOpacities(row: HTMLElement): string[] {
  return [...row.children].map(cell => (cell as HTMLElement).style.opacity);
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

  // A chart mounted inside `display: none` has no layout box, so the scrollLeft
  // assignment is silently discarded and an embedder that reveals it later (a
  // reveal.js slide, a tab, an accordion) is left stuck at rangeStart. A
  // mount-only latch passes the test above and fails this one.
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

// A roadmap that brackets the pinned today, which the fixture above does not:
//   rangeStart = Jul 1 − RANGE_PAD(4) = Sat Jun 27 2026, totalDays = 72
//   today is Jul 28 2026, so the marker sits at 31 * BASE_DAY_W(40)
const TODAY_X = 1240;

function spanningToday(): Task {
  return task({ start: '2026-07-01', end: '2026-08-31' });
}

describe('today marker', () => {
  test('draws the line, the header dot and the full-height bar while today is in view', () => {
    const stubs = installLayoutStubs(1182);
    try {
      draw([spanningToday()]);
      expect(todayMarkerCount()).toBe(3);
    } finally {
      stubs.restore();
    }
  });

  test('stops drawing the marker once today scrolls behind the label column', () => {
    const stubs = installLayoutStubs(1182);
    try {
      draw([spanningToday()]);

      scrollTo(TODAY_X + 1);

      expect(todayMarkerCount()).toBe(0);
    } finally {
      stubs.restore();
    }
  });

  // At exactly TODAY_X today is the leftmost visible column, so hiding it there
  // would drop the marker a day early.
  test('draws it again the moment today clears the label column', () => {
    const stubs = installLayoutStubs(1182);
    try {
      draw([spanningToday()]);
      scrollTo(TODAY_X + 1);

      scrollTo(TODAY_X);

      expect(todayMarkerCount()).toBe(3);
    } finally {
      stubs.restore();
    }
  });

  // The pure clip is covered in chartLayout.test.ts; this pins that the component
  // feeds it the *live* scrollLeft rather than a stale mirror of it.
  test('lets the glow reach the label column edge and no further', () => {
    const stubs = installLayoutStubs(1182);
    try {
      draw([spanningToday()]);

      scrollTo(TODAY_X);
      expect(todayBar().style.clipPath).toBe('inset(-14px -14px -14px 0px)');

      scrollTo(TODAY_X - 10);
      expect(todayBar().style.clipPath).toBe('inset(-14px -14px -14px -10px)');

      scrollTo(0);
      expect(todayBar().style.clipPath).toBe('inset(-14px -14px -14px -14px)');
    } finally {
      stubs.restore();
    }
  });

  // The uncapped offset the initial scroll relies on must not reach the marker.
  test('draws nothing for a roadmap that ends before today', () => {
    const stubs = installLayoutStubs(1182);
    try {
      draw([task()]);
      expect(todayMarkerCount()).toBe(0);
    } finally {
      stubs.restore();
    }
  });
});

// Day 10 of the fixture grid is Jul 7 2026, so the pill reads "Jul 7": five
// characters, hoverPillW 54, half-width 27. The column spans 400–440.
describe('hover pill', () => {
  test('centres the pill on the hovered column', () => {
    const stubs = installLayoutStubs(1182);
    try {
      draw([spanningToday()]);
      scrollTo(0);

      hoverAt(280 + 410);

      expect(hoverPill().style.left).toBe('420px');
    } finally {
      stubs.restore();
    }
  });

  test('slides the pill clear of the label column edge', () => {
    const stubs = installLayoutStubs(1182);
    try {
      draw([spanningToday()]);
      scrollTo(410);

      hoverAt(280);

      // 410 + 54/2: the leftmost centre that keeps the whole pill on screen.
      expect(hoverPill().style.left).toBe('437px');
    } finally {
      stubs.restore();
    }
  });

  // With the pill clamped, a stale offset parks a wrong date at the label edge
  // rather than scrolling it harmlessly out of sight — it read "Aug 10" in
  // September.
  test('renames the pill when a scroll moves a new day under the cursor', () => {
    const stubs = installLayoutStubs(1182);
    try {
      draw([spanningToday()]);
      scrollTo(0);
      hoverAt(280 + 410);
      expect(hoverPill().textContent).toBe('Jul 7');

      scrollTo(400);

      // Same cursor, ten days further along the grid.
      expect(hoverPill().textContent).toBe('Jul 17');
    } finally {
      stubs.restore();
    }
  });
});

describe('hover dimming', () => {
  // The cell assertions are the point: a faded sticky label cell goes translucent
  // over the timeline it exists to occlude. See `dimmed` in GanttChart.tsx.
  test('fades whole rows and leaves the cells opaque', () => {
    const stubs = installLayoutStubs(1182);
    try {
      draw([task(), task({ name: 'Second' })]);
      const [projectRow, hovered, peer] = rows();

      act(() => { hovered.dispatchEvent(new Event('mouseenter')); });

      expect([projectRow, hovered, peer].map(r => r.style.opacity)).toEqual(['0.4', '1', '0.4']);
      expect(cellOpacities(projectRow)).toEqual(['', '']);
      expect(cellOpacities(hovered)).toEqual(['', '']);
      expect(cellOpacities(peer)).toEqual(['', '']);
    } finally {
      stubs.restore();
    }
  });
});

describe('rangeStart re-anchor', () => {
  // Holding scroll across a reload means holding the *date* at the left edge, not
  // the pixel: an earlier task shifts every offset right while scrollLeft, which
  // the render never touches, keeps pointing at what is now an earlier day.
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

// A project with nothing under it is a real state of a roadmap — work that is
// planned but not yet broken down — and dropping it silently makes the chart
// disagree with the file it was rendered from.
describe('empty projects', () => {
  const FALLOW = ['Product Launch', 'Fallow'];

  // Nothing here reads geometry, but GanttChart constructs a ResizeObserver on
  // mount and jsdom has none.
  let stubs: ReturnType<typeof installLayoutStubs>;
  beforeEach(() => { stubs = installLayoutStubs(1182); });
  afterEach(() => stubs.restore());

  test('renders a project declared with no tasks as a bare header row', () => {
    draw([task()], { projects: FALLOW });

    expect(projectNames()).toEqual(FALLOW);
    expect(projectGroups()[1].children).toHaveLength(1);
  });

  test('drops a project declared with no tasks when hideEmptyProjects is set', () => {
    draw([task()], { projects: FALLOW, hideEmptyProjects: true });

    expect(projectNames()).toEqual(['Product Launch']);
  });

  // The second source of emptiness: the project has tasks, the assignee filter
  // is just hiding all of them. One setting governs both.
  test('keeps a project whose tasks are all filtered out', () => {
    draw([task({ assignees: ['Alice'] })], { selectedAssignees: new Set(['Zoe']) });

    expect(projectNames()).toEqual(['Product Launch']);
    expect(projectGroups()[0].children).toHaveLength(1);
  });

  test('drops a filter-emptied project when hideEmptyProjects is set', () => {
    draw([task({ assignees: ['Alice'] })], {
      selectedAssignees: new Set(['Zoe']),
      hideEmptyProjects: true,
    });

    expect(projectGroups()).toHaveLength(0);
  });

  // Colours are handed out by position in the project list. Deriving that list
  // from the tasks instead would skip the empty project, so writing 'Gap' its
  // first task would recolour every project after it.
  test('spends a colour slot on an empty project', () => {
    const tasks = [task({ project: 'Fallow' }), task({ project: 'Late' })];

    draw(tasks, { projects: ['Fallow', 'Gap', 'Late'] });
    const third = headerColor('Late');

    draw(tasks, { projects: ['Fallow', 'Late'] });

    expect(third).not.toBe(headerColor('Late'));
  });
});

/** The project header's name is painted in that project's assigned colour. */
function headerColor(name: string): string {
  const group = projectGroups().find(g => g.querySelector('span')!.textContent === name);
  return (group!.querySelector('span') as HTMLElement).style.color;
}
