import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { addDays, computeRange, parseDay, todayOffset } from '../src/timeline';
import type { Task } from '../src/parseYaml';

// Every expectation here is hand-derived in this one zone. It is deliberately
// not UTC: a UTC run hides exactly the local-vs-UTC confusion these tests
// exist to catch, and New York has a DST transition to pin the day math on.
const ZONE = 'America/New_York';
let originalTZ: string | undefined;

beforeAll(() => {
  originalTZ = process.env.TZ;
  process.env.TZ = ZONE;
});

afterAll(() => {
  // Assigning an undefined originalTZ back would set the *string* "undefined",
  // leaving the process in GMT rather than in the zone it started in.
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
  // Bars, gridlines and the today marker all sit on a local-midnight grid.
  // Parsing as UTC instead ("new Date(s)") lands 2026-07-01 on Jun 30 20:00
  // local, shifting every bar a day west of UTC.
  test('reads a date string as local midnight, not UTC midnight', () => {
    expect(parseDay('2026-07-01').getTime()).toBe(new Date(2026, 6, 1).getTime());
  });
});

describe('addDays', () => {
  // The day-number header and the hover tooltip walk the grid one column at a
  // time. Nov 1 2026 is a 25-hour day in New York, so stepping by a fixed
  // 86_400_000 falls an hour behind and lands on 23:00 of the day before —
  // printing the same day number twice and labelling every later column a day
  // behind the bars, which count calendar days.
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
  // rangeStart and totalDays are the origin and width of every coordinate in
  // the chart: bar offsets, month headers, the today marker, initial scroll.
  test('derives the grid from the task dates, padded on both sides', () => {
    const { rangeStart, totalDays } = computeRange([task()]);

    // Jul 1 − 4 days = Sat Jun 27; Jul 11 + 6 days = Fri Jul 17; inclusive.
    expect(rangeStart.getTime()).toBe(new Date(2026, 5, 27).getTime());
    expect(totalDays).toBe(21);
  });

  // The baseline bars are drawn from these dates, so a range that ignores them
  // positions them off-grid — at a negative offset when the slip is backwards.
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

  // Mar 8 2026 is a 23-hour day in New York. Truncating instead of rounding the
  // elapsed-millisecond division swallows it and the grid comes up a day short.
  test('spans a DST transition without losing a day', () => {
    const { totalDays } = computeRange([task({ start: '2026-03-01', end: '2026-03-15' })]);

    expect(totalDays).toBe(25);
  });

  // The week gridlines are a repeating gradient offset by this value; get it
  // wrong and every week boundary is drawn on the wrong weekday.
  test('offsets the week gridlines to the first Monday in the range', () => {
    // rangeStart is Sat Jun 27 2026, so the first Monday is Jun 29.
    expect(computeRange([task()]).firstMondayOffset).toBe(2);

    // rangeStart is itself Mon Jul 27 2026, so there is nothing to skip — the
    // boundary case that a "days until Monday" formula without a wrap gets
    // wrong by a full week.
    const laterTask = task({ start: '2026-07-31', end: '2026-08-05' });
    expect(computeRange([laterTask]).firstMondayOffset).toBe(0);
  });

  // Each month cell is absolutely positioned at `offset` days with `width` days.
  // They have to tile the grid exactly: a cell that runs long overlaps its
  // neighbour, and the last one would overhang the end of the timeline.
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

  test('splits month headers across a year boundary', () => {
    const { months } = computeRange([task({ start: '2026-12-20', end: '2027-01-10' })]);

    // rangeStart is Dec 16 2026; Jan 1 2027 is 16 days later.
    expect(months.map((m) => [m.label, m.offset])).toEqual([
      ['December 2026', 0],
      ['January 2027', 16],
    ]);
  });
});

describe('todayOffset', () => {
  // Regression: this read UTC date parts while the grid is local, so the marker
  // and the opening viewport sat a day off for the width of the UTC offset every
  // day — evening hours west of UTC, small hours east of it.
  test('uses the local calendar day, not the UTC one', () => {
    // 22:00 on Jul 27 in New York is already Jul 28 in UTC.
    const offset = todayOffset(new Date(2026, 6, 1), new Date(2026, 6, 27, 22, 0));

    // Jul 27 is 26 days after Jul 1.
    expect(offset).toBe(26);
  });

  // Hiding the marker off-range and clamping the initial scroll both depend on
  // this staying unclamped, so a roadmap wholly in the past or future still
  // reports how far away today is.
  test('runs negative before the range and past its end after it', () => {
    const rangeStart = new Date(2026, 6, 1);

    expect(todayOffset(rangeStart, new Date(2026, 5, 20, 12, 0))).toBe(-11);
    expect(todayOffset(rangeStart, new Date(2026, 8, 1, 12, 0))).toBe(62);
  });
});
