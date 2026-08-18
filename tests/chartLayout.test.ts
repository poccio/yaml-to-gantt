import { describe, test, expect } from 'vitest';
import { BASE_DAY_W, GHOST_BORDER_W, LABEL_W, chipX, effectiveDayW, hoverOffsetAt, hoverPillCenter, hoverPillW, isBehindLabelColumn, rowMinW, taskBarGeometry, timelineMinW, todayBarClip } from '../src/chartLayout';
import type { Task } from '../src/parseYaml';

describe('effectiveDayW', () => {
  // Before the ResizeObserver has reported, there is no width to divide up.
  test('falls back to BASE_DAY_W before the container has been measured', () => {
    expect(effectiveDayW(0, 21)).toBe(BASE_DAY_W);
  });

  // A short roadmap must stretch to fill the card, or the chart ends in a block
  // of dead space — the phantom-empty-space bug.
  test('stretches days to fill a container wider than the timeline', () => {
    // (1400 − 280) / 20 = 56px per day.
    expect(effectiveDayW(1400, 20)).toBe(56);
  });

  // The other direction must not shrink below BASE_DAY_W: a long roadmap scrolls
  // horizontally rather than compressing into an unreadable smear.
  test('never shrinks below BASE_DAY_W', () => {
    // (700 − 280) / 21 = 20, which is below the floor.
    expect(effectiveDayW(700, 21)).toBe(BASE_DAY_W);
  });

  test('holds at BASE_DAY_W exactly where the timeline fills the container', () => {
    // (1120 − 280) / 21 = 40 — the boundary between the two branches above.
    expect(effectiveDayW(1120, 21)).toBe(BASE_DAY_W);
  });
});

describe('rowMinW', () => {
  test('spans the label column plus the whole timeline', () => {
    // 280 + 21 × 40 = 1120.
    expect(rowMinW(21)).toBe(1120);
  });

  test('reaches the full scroll width when the timeline overflows', () => {
    expect(rowMinW(110)).toBe(LABEL_W + timelineMinW(110));
    expect(rowMinW(110)).toBeGreaterThan(1694); // a card that scrolls
  });

  // Wider than the container would reintroduce the phantom empty space, narrower
  // would clip the labels — so this has to land on effectiveDayW's boundary.
  test('matches the container exactly at the stretch/scroll boundary', () => {
    expect(effectiveDayW(1120, 21)).toBe(BASE_DAY_W);
    expect(rowMinW(21)).toBe(1120);
  });
});

describe('hoverOffsetAt', () => {
  // The label column is sticky and the timeline scrolls under it, so the cursor's
  // page x means nothing in day-space until both are subtracted out.
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

describe('isBehindLabelColumn', () => {
  test('reports a day scrolled past the label column edge as behind it', () => {
    expect(isBehindLabelColumn({ offset: 10, dayW: 40, scrollLeft: 401 })).toBe(true);
  });

  // Off by one here and the today marker vanishes a day early, while today is
  // still the leftmost visible column.
  test('reports a day flush against the label column edge as visible', () => {
    expect(isBehindLabelColumn({ offset: 10, dayW: 40, scrollLeft: 400 })).toBe(false);
  });

  test('reports the origin as visible before any scrolling', () => {
    expect(isBehindLabelColumn({ offset: 0, dayW: 40, scrollLeft: 0 })).toBe(false);
  });

  // A stretched grid puts the same day at a different pixel, so the predicate has
  // to be given the width the marker was positioned with, not BASE_DAY_W.
  test('follows the day width it is given', () => {
    expect(isBehindLabelColumn({ offset: 10, dayW: 56, scrollLeft: 500 })).toBe(false);
    expect(isBehindLabelColumn({ offset: 10, dayW: 40, scrollLeft: 500 })).toBe(true);
  });
});

describe('todayBarClip', () => {
  // Away from the labels the clip must not quietly reshape the marker.
  test('leaves the glow whole when the bar is clear of the label column', () => {
    expect(todayBarClip({ x: 400, scrollLeft: 0, blur: 14 }))
      .toBe('inset(-14px -14px -14px -14px)');
  });

  test('cuts the glow at the bar when it sits on the label column edge', () => {
    expect(todayBarClip({ x: 400, scrollLeft: 400, blur: 14 }))
      .toBe('inset(-14px -14px -14px 0px)');
  });

  // Between the two the reach tracks the gap exactly, so there is no visible step
  // as the bar scrolls in and out.
  test('lets the glow reach the label column edge and stop', () => {
    expect(todayBarClip({ x: 405, scrollLeft: 400, blur: 14 }))
      .toBe('inset(-14px -14px -14px -5px)');
  });

  // Without the Math.max this would read `inset(... 5px)` and eat into the 2px
  // bar rather than its glow.
  test('never clips into the bar itself', () => {
    expect(todayBarClip({ x: 395, scrollLeft: 400, blur: 14 }))
      .toBe('inset(-14px -14px -14px 0px)');
  });
});

describe('hoverPillCenter', () => {
  test('centres the pill on its day column when there is room', () => {
    // Day 10 spans 400–440, so its middle is 420, well clear of the labels.
    expect(hoverPillCenter({ offset: 10, dayW: 40, scrollLeft: 0, pillW: 54 })).toBe(420);
  });

  test('slides the pill clear of the label column edge', () => {
    // Column middle 420 would put the pill's left edge at 393, under a label
    // column ending at 410; 437 is the leftmost centre that clears it.
    expect(hoverPillCenter({ offset: 10, dayW: 40, scrollLeft: 410, pillW: 54 })).toBe(437);
  });

  // A floor, not a snap.
  test('leaves a column that already clears the edge alone', () => {
    expect(hoverPillCenter({ offset: 10, dayW: 40, scrollLeft: 393, pillW: 54 })).toBe(420);
  });

  test('gives a wider pill a wider berth', () => {
    const short = hoverPillCenter({ offset: 10, dayW: 40, scrollLeft: 410, pillW: hoverPillW('Aug 1') });
    const long = hoverPillCenter({ offset: 10, dayW: 40, scrollLeft: 410, pillW: hoverPillW('Sep 12') });
    expect(long).toBeGreaterThan(short);
  });

  test('sizes the pill from its label', () => {
    // 5 chars * 7.2 + 9px of padding a side.
    expect(hoverPillW('Aug 1')).toBeCloseTo(54);
  });
});

describe('constants', () => {
  // Pinned because the jsdom scroll tests hand-derive expected pixel values
  // from them; changing either silently invalidates those expectations.
  test('pin the grid dimensions', () => {
    expect(BASE_DAY_W).toBe(40);
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
  // Bars include their end date: a Jul 1 to Jul 11 task covers 11 days, not 10.
  // Dropping the +1 makes every bar end a day short.
  test('positions a bar from the range origin, inclusive of the end date', () => {
    // Jul 1 is 4 days after Jun 27, Jul 11 is 14: left 160, width 11 * 40.
    expect(taskBarGeometry(task(), RANGE_START, BASE_DAY_W)).toEqual({
      barLeft: 160, barW: 440, ghost: null,
    });
  });

  test('places the baseline ghost when both original dates are given', () => {
    const slipped = task({
      originallyPlannedStart: '2026-06-29',
      originallyPlannedEnd: '2026-07-05',
    });

    // Jun 29 is offset 2, Jul 5 is offset 8: left 80, width 7 * 40, then grown
    // by the stroke on each side.
    expect(taskBarGeometry(slipped, RANGE_START, BASE_DAY_W).ghost).toEqual({
      left: 80 - GHOST_BORDER_W, width: 280 + 2 * GHOST_BORDER_W,
    });
  });

  // A shared edge used to eat the dashes: the stroke sat inside the ghost's box,
  // on the same pixels as the bar, and the bar paints over it.
  test('keeps the ghost stroke clear of a bar that starts or ends on the same day', () => {
    const onTime = task({
      originallyPlannedStart: '2026-07-01',
      originallyPlannedEnd: '2026-07-11',
    });

    const { barLeft, barW, ghost } = taskBarGeometry(onTime, RANGE_START, BASE_DAY_W);

    expect(ghost!.left + GHOST_BORDER_W).toBe(barLeft);
    expect(ghost!.left + ghost!.width - GHOST_BORDER_W).toBe(barLeft + barW);
  });

  // Both-or-neither: treating a missing end as offset 0 draws a ghost from the
  // grid origin to the start date — a slip that never happened.
  test('ignores a half-specified baseline', () => {
    const startOnly = task({ originallyPlannedStart: '2026-06-29' });
    const endOnly = task({ originallyPlannedEnd: '2026-07-05' });

    expect(taskBarGeometry(startOnly, RANGE_START, BASE_DAY_W).ghost).toBeNull();
    expect(taskBarGeometry(endOnly, RANGE_START, BASE_DAY_W).ghost).toBeNull();
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

  // Flipping only helps if there is room on the left. A bar that overflows right
  // and starts near the origin keeps its chips on the right, clipped, rather than
  // flipping them to a negative offset.
  test('keeps chips right when there is no room on the left either', () => {
    expect(chipX({
      barLeft: 20, barW: 600, assignees: ['Bob'], totalDays: 16, dayW: 40,
    })).toBe(626);
  });

  // An empty assignees list must not coerce approxChipW to NaN and poison the
  // left/right comparison; it behaves like a zero-width chip at the bar end.
  test('leaves the chip position at the bar end when there are no assignees', () => {
    expect(chipX({
      barLeft: 160, barW: 440, assignees: [], totalDays: 21, dayW: 40,
    })).toBe(606);
  });
});
