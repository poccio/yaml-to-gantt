import type { Task } from './parseYaml';

// Blank days of context on either side, so the first and last bars are not
// flush against the edge of the grid.
const RANGE_PAD = 4;

export interface MonthInfo {
  label: string;
  offset: number;
  width: number;
}

export interface TimelineRange {
  /** Local midnight of day 0 — the origin every offset in the chart counts from. */
  rangeStart: Date;
  totalDays: number;
  months: MonthInfo[];
  /** Day offset of the first Monday, used to phase the week gridlines. */
  firstMondayOffset: number;
}

// Every date here is a *calendar* date at local midnight, moved only through the
// Date constructor, which walks the calendar. Never step by a fixed 86_400_000:
// a fall-back day is 25 hours, so ms arithmetic drifts onto 23:00 of the day
// before and stays there.

/**
 * A `YYYY-MM-DD` date read as *local* midnight. Reading it as UTC would shift
 * every bar a day for any viewer west of UTC.
 */
export function parseDay(s: string): Date {
  const [year, month, day] = s.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/**
 * Whole calendar days from `a` to `b`, ignoring any time of day. Both sides are
 * re-pinned to UTC midnight, where every day is 24 hours, so the division is
 * exact and needs no rounding to absorb a DST transition.
 */
export function daysBetween(a: Date, b: Date): number {
  const from = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const to = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return (to - from) / 86_400_000;
}

/**
 * The day grid the chart is drawn on. Assumes at least one task — see
 * `hasChartableRange`.
 */
export function computeRange(tasks: Task[]): TimelineRange {
  const allDates = tasks.flatMap(t => {
    const ds = [parseDay(t.start), parseDay(t.end)];
    if (t.originallyPlannedStart) ds.push(parseDay(t.originallyPlannedStart));
    if (t.originallyPlannedEnd) ds.push(parseDay(t.originallyPlannedEnd));
    return ds;
  });
  const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
  const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));

  const rangeStart = addDays(minDate, -RANGE_PAD);
  const rangeEnd = addDays(maxDate, RANGE_PAD + 2);

  const totalDays = daysBetween(rangeStart, rangeEnd) + 1;

  // The `% 7` is what keeps a rangeStart that is already a Monday at 0 rather
  // than a full week out.
  const firstMondayOffset = (8 - rangeStart.getDay()) % 7;

  const months: MonthInfo[] = [];
  let year = rangeStart.getFullYear();
  let month = rangeStart.getMonth();
  for (
    let monthStart = new Date(year, month, 1);
    monthStart <= rangeEnd;
    monthStart = new Date(year, ++month, 1)
  ) {
    // Local midnight like the rest of the grid: ending the cell on 23:59:59.999
    // instead makes it a day too wide and overlaps its neighbour.
    const monthEnd = new Date(year, month + 1, 0);
    const mStart = monthStart < rangeStart ? rangeStart : monthStart;
    const mEnd = monthEnd > rangeEnd ? rangeEnd : monthEnd;
    months.push({
      label: monthStart.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
      offset: daysBetween(rangeStart, mStart),
      width: daysBetween(mStart, mEnd) + 1,
    });
  }

  return { rangeStart, totalDays, months, firstMondayOffset };
}

/**
 * Days to scroll by to keep the same calendar date under a fixed viewport when
 * the grid's origin moves from `prev` to `next`.
 *
 * Editing the YAML can move `rangeStart`. Every offset is recomputed against the
 * new origin, but `scrollLeft` is a raw pixel value that survives the update, so
 * without this correction a new earliest task slides the grid right underneath a
 * viewport that stays put. Positive when the origin moved earlier.
 */
export function scrollShiftDays(prev: Date, next: Date): number {
  return daysBetween(next, prev);
}

/**
 * Day offset of `now`'s *local* calendar day from `rangeStart`. Reading UTC date
 * parts here would place today a day off for the width of the UTC offset every
 * day (evenings west of UTC, small hours east of it).
 *
 * Uncapped on purpose: for a roadmap wholly past or future the out-of-range
 * number is what hides the marker and lets the browser clamp the initial scroll.
 */
export function todayOffset(rangeStart: Date, now: Date): number {
  return daysBetween(rangeStart, now);
}

/**
 * `computeRange` takes `Math.min` over the task dates, which is `Infinity` for
 * an empty list: the origin comes out an Invalid Date and every width NaN,
 * silently, with nothing thrown. Callers must check this before charting.
 */
export function hasChartableRange(tasks: Task[]): boolean {
  return tasks.length > 0;
}
