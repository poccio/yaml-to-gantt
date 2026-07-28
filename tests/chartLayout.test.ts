import { describe, test, expect } from 'vitest';
import { DAY_W, LABEL_W, chipX, effectiveDayW, hoverOffsetAt, taskBarGeometry } from '../src/chartLayout';
import type { Task } from '../src/parseYaml';

describe('effectiveDayW', () => {
  // Before the ResizeObserver has reported, there is no width to divide up.
  test('falls back to DAY_W before the container has been measured', () => {
    expect(effectiveDayW(0, 21)).toBe(DAY_W);
  });

  // A short roadmap must stretch to fill the card, or the chart ends in a
  // block of dead space — the phantom-empty-space bug AGENTS.md warns about.
  test('stretches days to fill a container wider than the timeline', () => {
    // (1400 − 280) / 20 = 56px per day.
    expect(effectiveDayW(1400, 20)).toBe(56);
  });

  // The other direction must NOT shrink below DAY_W: a long roadmap scrolls
  // horizontally rather than compressing into an unreadable smear.
  test('never shrinks below DAY_W', () => {
    // (700 − 280) / 21 = 20, which is below the floor.
    expect(effectiveDayW(700, 21)).toBe(DAY_W);
  });

  test('holds at DAY_W exactly where the timeline fills the container', () => {
    // (1120 − 280) / 21 = 40 — the boundary between the two branches above.
    expect(effectiveDayW(1120, 21)).toBe(DAY_W);
  });
});

describe('hoverOffsetAt', () => {
  // The label column is sticky and the timeline scrolls under it, so the
  // cursor's page x has to be corrected by both the label width and the scroll
  // before it means anything in day-space.
  test('converts a cursor position into a day offset', () => {
    // 500 − 100 − 280 = 120px into the timeline; 120 / 40 = day 3.
    expect(hoverOffsetAt({
      clientX: 500, containerLeft: 100, scrollLeft: 0, dayW: 40, totalDays: 21,
    })).toBe(3);
  });

  // Dropping scrollLeft is the classic version of this bug: the crosshair
  // tracks the cursor at scroll 0 and drifts further off with every scroll.
  test('accounts for horizontal scroll', () => {
    // 500 − 100 − 280 + 800 = 920; 920 / 40 = day 23.
    expect(hoverOffsetAt({
      clientX: 500, containerLeft: 100, scrollLeft: 800, dayW: 40, totalDays: 40,
    })).toBe(23);
  });

  // Over the sticky label column there is no day under the cursor. Without the
  // negative check this floors to −5 and the crosshair jumps to the left edge.
  test('reports no day when the cursor is over the label column', () => {
    expect(hoverOffsetAt({
      clientX: 200, containerLeft: 100, scrollLeft: 0, dayW: 40, totalDays: 21,
    })).toBeNull();
  });

  // The timeline cell is `flex: 1`, so it can be wider than totalDays of grid.
  test('reports no day past the end of the grid', () => {
    expect(hoverOffsetAt({
      clientX: 500, containerLeft: 100, scrollLeft: 0, dayW: 40, totalDays: 2,
    })).toBeNull();
  });
});

describe('constants', () => {
  // Pinned because the jsdom scroll tests hand-derive expected pixel values
  // from them; changing either silently invalidates those expectations.
  test('pin the grid dimensions', () => {
    expect(DAY_W).toBe(40);
    expect(LABEL_W).toBe(280);
  });
});

// rangeStart for the fixtures below: Sat Jun 27 2026, the grid origin a
// Jul 1 – Jul 11 task produces once computeRange applies its 4-day lead pad.
const RANGE_START = new Date(2026, 5, 27);

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

describe('taskBarGeometry', () => {
  // Bars are inclusive of their end date — a Jul 1 to Jul 11 task covers 11
  // days, not 10. Dropping the +1 makes every bar end a day short.
  test('positions a bar from the range origin, inclusive of the end date', () => {
    // Jul 1 is 4 days after Jun 27, Jul 11 is 14: left 160, width 11 * 40.
    expect(taskBarGeometry(task(), RANGE_START, DAY_W)).toEqual({
      barLeft: 160, barW: 440, ghost: null,
    });
  });

  test('places the baseline ghost when both original dates are given', () => {
    const slipped = task({
      originallyPlannedStart: '2026-06-29',
      originallyPlannedEnd: '2026-07-05',
    });

    // Jun 29 is offset 2, Jul 5 is offset 8: left 80, width 7 * 40.
    expect(taskBarGeometry(slipped, RANGE_START, DAY_W).ghost).toEqual({
      left: 80, width: 280,
    });
  });

  // Both-or-neither. One date alone cannot describe a baseline bar, and
  // treating the missing end as offset 0 would draw a ghost from the grid
  // origin to the start date — a slip that never happened.
  test('ignores a half-specified baseline', () => {
    const startOnly = task({ originallyPlannedStart: '2026-06-29' });
    const endOnly = task({ originallyPlannedEnd: '2026-07-05' });

    expect(taskBarGeometry(startOnly, RANGE_START, DAY_W).ghost).toBeNull();
    expect(taskBarGeometry(endOnly, RANGE_START, DAY_W).ghost).toBeNull();
  });

  // At a compressed day width a one-day task rounds to a bar too thin to see
  // or hover, so width has an absolute floor independent of the grid.
  test('floors the bar width so a short task stays visible', () => {
    const oneDay = task({ start: '2026-07-01', end: '2026-07-01' });

    // 1 day * 4px would be 4; the floor lifts it to 8.
    expect(taskBarGeometry(oneDay, RANGE_START, 4).barW).toBe(8);
  });
});

describe('chipX', () => {
  // The default: assignee chips sit just past the right end of the bar.
  test('places chips to the right of the bar when they fit', () => {
    expect(chipX({
      barLeft: 160, barW: 440, assignees: ['Bob'], totalDays: 21, dayW: 40,
    })).toBe(606);
  });

  // A bar ending near the right edge would push its chips off the grid, where
  // they are clipped and unreadable — so they flip to the bar's left instead.
  test('flips chips to the left when they would overflow the grid', () => {
    // Same bar, a narrower grid: 606 + 30.6 exceeds 21-day-equivalent room.
    expect(chipX({
      barLeft: 160, barW: 440, assignees: ['Bob'], totalDays: 16, dayW: 40,
    })).toBe(123.4);
  });

  // Flipping only helps if there is room on the left. A bar that overflows the
  // right AND starts near the origin keeps its chips on the right, clipped,
  // rather than flipping them to a negative offset.
  test('keeps chips right when there is no room on the left either', () => {
    expect(chipX({
      barLeft: 20, barW: 600, assignees: ['Bob'], totalDays: 16, dayW: 40,
    })).toBe(626);
  });

  // approxChipW's reduce starts from an empty array, so an empty assignees
  // list must not throw or coerce to NaN and poison the left/right comparison
  // — it should behave exactly like a zero-width chip sitting at the bar end.
  test('leaves the chip position at the bar end when there are no assignees', () => {
    expect(chipX({
      barLeft: 160, barW: 440, assignees: [], totalDays: 21, dayW: 40,
    })).toBe(606);
  });
});
