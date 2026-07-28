import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import {
  addDays,
  computeRange,
  hasChartableRange,
  parseDay,
  scrollShiftDays,
  todayOffset,
} from '../src/timeline';
import type { Task } from '../src/parseYaml';

// Every expectation here is hand-derived in this one zone, deliberately not UTC:
// a UTC run hides the local-vs-UTC confusion these tests exist to catch, and New
// York has a DST transition to pin the day math on.
const ZONE = 'America/New_York';
let originalTZ: string | undefined;

beforeAll(() => {
  originalTZ = process.env.TZ;
  process.env.TZ = ZONE;
});

afterAll(() => {
  // Assigning an undefined originalTZ back sets the *string* "undefined", which
  // leaves the process in GMT rather than the zone it started in.
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

describe('parseDay', () => {
  // `new Date(s)` instead lands 2026-07-01 on Jun 30 20:00 local, shifting every
  // bar a day west of UTC.
  test('reads a date string as local midnight, not UTC midnight', () => {
    expect(parseDay('2026-07-01').getTime()).toBe(new Date(2026, 6, 1).getTime());
  });
});

describe('addDays', () => {
  // Nov 1 2026 is a 25-hour day in New York, so stepping the day-number header by
  // a fixed 86_400_000 lands on 23:00 of the day before: it printed the same day
  // number twice and then labelled every later column a day behind the bars.
  test('advances one calendar day per step across a fall-back transition', () => {
    const friday = new Date(2026, 9, 30); // Fri Oct 30 2026

    const dayNumbers = [0, 1, 2, 3, 4].map((off) => addDays(friday, off).getDate());

    expect(dayNumbers).toEqual([30, 31, 1, 2, 3]);
  });

  test('walks backwards for a negative count', () => {
    expect(addDays(new Date(2026, 2, 3), -5).getTime()).toBe(new Date(2026, 1, 26).getTime());
  });
});

describe('computeRange', () => {
  // rangeStart and totalDays are the origin and width every other coordinate in
  // the chart is measured against.
  test('derives the grid from the task dates, padded on both sides', () => {
    const { rangeStart, totalDays } = computeRange([task()]);

    // Jul 1 − 4 days = Sat Jun 27; Jul 11 + 6 days = Fri Jul 17; inclusive.
    expect(rangeStart.getTime()).toBe(new Date(2026, 5, 27).getTime());
    expect(totalDays).toBe(21);
  });

  // The baseline bars are drawn from these dates, so a range that ignores them
  // puts them off-grid — at a negative offset when the slip is backwards.
  test('extends the range to cover originallyPlanned dates', () => {
    const slipped = {
      start: '2026-07-10',
      end: '2026-07-20',
      originallyPlannedStart: '2026-07-01',
      originallyPlannedEnd: '2026-07-15',
    };

    const withBaseline = computeRange([task(slipped)]);
    const withoutBaseline = computeRange([task({ start: '2026-07-10', end: '2026-07-20' })]);

    expect(withBaseline.rangeStart.getTime()).toBe(new Date(2026, 5, 27).getTime());
    expect(withoutBaseline.rangeStart.getTime()).toBe(new Date(2026, 6, 6).getTime());
  });

  // Mar 8 2026 is a 23-hour day in New York, Nov 1 a 25-hour one. Truncating
  // elapsed-millisecond arithmetic comes up a day short across the spring
  // transition: the March cell reports 20 days instead of 21. Month widths are
  // asserted separately from totalDays because the month loop does its own
  // arithmetic, so a mutant can bypass `daysBetween` there alone. A naive-ms
  // `Math.round` survives this test — rounding absorbs the missing hour — and
  // the `todayOffset` tests catch that one.
  test('spans a DST transition without losing a day', () => {
    const spring = computeRange([task({ start: '2026-03-01', end: '2026-03-15' })]);

    expect(spring.totalDays).toBe(25);
    // rangeStart is Wed Feb 25 2026, rangeEnd Sat Mar 21: 4 days of February,
    // then 21 of March spanning the spring-forward day.
    expect(spring.months.map((m) => [m.offset, m.width])).toEqual([
      [0, 4],
      [4, 21],
    ]);

    const fall = computeRange([task({ start: '2026-10-15', end: '2026-12-05' })]);

    expect(fall.totalDays).toBe(62);
    // rangeStart is Sun Oct 11 2026, rangeEnd Fri Dec 11: 21 days of October,
    // all of November spanning the fall-back day, then 11 of December.
    expect(fall.months.map((m) => [m.offset, m.width])).toEqual([
      [0, 21],
      [21, 30],
      [51, 11],
    ]);
  });

  // The week gridlines are a repeating gradient phased by this value; wrong, and
  // every week boundary lands on the wrong weekday.
  test('offsets the week gridlines to the first Monday in the range', () => {
    // rangeStart is Sat Jun 27 2026, so the first Monday is Jun 29.
    expect(computeRange([task()]).firstMondayOffset).toBe(2);

    // rangeStart is itself Mon Jul 27 2026, so there is nothing to skip — the
    // boundary case that a "days until Monday" formula without a wrap gets
    // wrong by a full week.
    const laterTask = task({ start: '2026-07-31', end: '2026-08-05' });
    expect(computeRange([laterTask]).firstMondayOffset).toBe(0);
  });

  // Month cells are absolutely positioned, so they have to tile the grid exactly:
  // a cell that runs long overlaps its neighbour or overhangs the timeline.
  test('lays month headers end to end, without overlap or overhang', () => {
    const { months } = computeRange([task({ start: '2026-07-01', end: '2026-09-15' })]);

    // rangeStart is Sat Jun 27 2026, rangeEnd Mon Sep 21, so: 4 days of June,
    // all of July and August, then 21 days of September = 87 = totalDays.
    expect(months.map((m) => [m.offset, m.width])).toEqual([
      [0, 4],
      [4, 31],
      [35, 31],
      [66, 21],
    ]);
  });

  // The trailing pad can push rangeEnd one day into the next month. Tidying that
  // sliver away (`if (w < 2) continue`) leaves the last day of the grid under no
  // month header, and the tiling assertion above cannot see it because none of
  // its cells are that narrow.
  test('keeps a month cell only one day wide', () => {
    const { totalDays, months } = computeRange([task({ start: '2026-07-10', end: '2026-07-26' })]);

    // rangeStart is Mon Jul 6 2026, rangeEnd Sat Aug 1 — so all 26 remaining
    // days of July, then August's single day.
    expect(totalDays).toBe(27);
    expect(months.map((m) => [m.label, m.offset, m.width])).toEqual([
      ['July 2026', 0, 26],
      ['August 2026', 26, 1],
    ]);
  });

  test('splits month headers across a year boundary', () => {
    const { months } = computeRange([task({ start: '2026-12-20', end: '2027-01-10' })]);

    // rangeStart is Dec 16 2026; Jan 1 2027 is 16 days later.
    expect(months.map((m) => [m.label, m.offset])).toEqual([
      ['December 2026', 0],
      ['January 2027', 16],
    ]);
  });

  // The degenerate output hasChartableRange exists to keep off screen: Math.min
  // over no dates is Infinity, so the origin is an Invalid Date and every width
  // NaN. Nothing throws, which is why the caller has to check rather than catch.
  // Pinned so that a later tidy-up handing this case a plausible fallback range
  // cannot quietly make the guard in App.tsx look redundant.
  test('degenerates instead of throwing when there are no tasks', () => {
    const { rangeStart, totalDays, firstMondayOffset, months } = computeRange([]);

    expect(rangeStart.getTime()).toBeNaN();
    expect(totalDays).toBeNaN();
    expect(firstMondayOffset).toBeNaN();
    expect(months).toEqual([]);
  });
});

describe('scrollShiftDays', () => {
  // An SSE reload is a prop update, not a remount, so scrollLeft survives it
  // while every offset is recomputed against the new rangeStart. Without this
  // correction the viewport keeps its pixel and loses its date.
  test('keeps the same date at the left edge when the roadmap grows earlier', () => {
    const existing = task({ start: '2026-07-01', end: '2026-07-31' });
    const base = computeRange([existing]);
    const grown = computeRange([
      existing,
      task({ name: 'Earlier task', start: '2026-06-21', end: '2026-06-25' }),
    ]);

    // rangeStart moves from Sat Jun 27 to Wed Jun 17, ten days earlier.
    const scrolledDays = 20; // wherever the user had scrolled to
    const shift = scrollShiftDays(base.rangeStart, grown.rangeStart);

    expect(shift).toBe(10);
    expect(addDays(grown.rangeStart, scrolledDays + shift).getTime())
      .toBe(addDays(base.rangeStart, scrolledDays).getTime());
  });

  // Deleting the earliest task has to scroll the other way, so the sign is
  // load-bearing: flipped, it moves the viewport twice as far the wrong way.
  test('runs negative when the origin moves later, and zero when it holds', () => {
    const early = new Date(2026, 5, 17);
    const late = new Date(2026, 5, 27);

    expect(scrollShiftDays(early, late)).toBe(-10);
    expect(scrollShiftDays(late, new Date(2026, 5, 27))).toBe(0);
  });

  // The shift is multiplied by a fixed day width, so it has to be whole calendar
  // days. Mar 8 2026 is 23 hours in New York: elapsed-ms arithmetic reports 13.96
  // days here and drags the viewport off the grid.
  test('counts calendar days across a DST transition', () => {
    expect(scrollShiftDays(new Date(2026, 2, 15), new Date(2026, 2, 1))).toBe(14);
  });
});

describe('todayOffset', () => {
  // Regression: this read UTC date parts while the grid is local, so the marker
  // and the opening viewport sat a day off for the width of the UTC offset every
  // day — evenings west of UTC, small hours east of it.
  test('uses the local calendar day, not the UTC one', () => {
    // 22:00 on Jul 27 in New York is already Jul 28 in UTC.
    const offset = todayOffset(new Date(2026, 6, 1), new Date(2026, 6, 27, 22, 0));

    // Jul 27 is 26 days after Jul 1.
    expect(offset).toBe(26);
  });

  // Hiding the marker off-range and clamping the initial scroll both depend on
  // this staying unclamped.
  test('runs negative before the range and past its end after it', () => {
    const rangeStart = new Date(2026, 6, 1);

    expect(todayOffset(rangeStart, new Date(2026, 5, 20, 12, 0))).toBe(-11);
    expect(todayOffset(rangeStart, new Date(2026, 8, 1, 12, 0))).toBe(62);
  });
});

describe('hasChartableRange', () => {
  // The decision that keeps computeRange's degenerate output (pinned above) off
  // screen: a zero-task roadmap is a valid parse, so App shows the empty state.
  test('rejects a roadmap with no tasks', () => {
    expect(hasChartableRange([])).toBe(false);
  });

  test('accepts a roadmap with at least one task', () => {
    expect(hasChartableRange([task()])).toBe(true);
  });
});
