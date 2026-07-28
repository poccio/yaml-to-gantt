import type { Task } from './parseYaml';

// Blank days of context on either side of the roadmap, so the first and last
// bars are not flush against the edge of the grid.
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

// Every date in this module is a *calendar* date pinned to local midnight, and
// every operation on one goes through the Date constructor, which walks the
// calendar. Never step by a fixed 86_400_000: a fall-back day is 25 hours long,
// so millisecond arithmetic drifts onto 23:00 of the day before and stays there.

/**
 * A `YYYY-MM-DD` date read as *local* midnight. Everything in the chart sits on
 * this grid, so reading these as UTC instead would shift every bar by a day for
 * any viewer west of UTC.
 */
export function parseDay(s: string): Date {
  const [year, month, day] = s.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** The calendar day `days` after `date` (or before it, for a negative count). */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/**
 * Whole calendar days from `a` to `b`, ignoring any time of day.
 *
 * Both dates are re-pinned to UTC midnight before subtracting. UTC has no DST,
 * so there the division is exact and needs no rounding to absorb 23- and
 * 25-hour days.
 */
export function daysBetween(a: Date, b: Date): number {
  const from = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const to = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return (to - from) / 86_400_000;
}

/**
 * The day grid the chart is drawn on, derived from the task dates alone.
 * Assumes at least one task — an empty roadmap has no dates to bound a range
 * with, and is shown as an empty state instead of a chart.
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

  // Days to skip before the first Monday, 0 when rangeStart already is one.
  // getDay() is 0 for Sunday, so the wrap is what keeps a Monday at 0 instead
  // of pushing it a full week out.
  const firstMondayOffset = (8 - rangeStart.getDay()) % 7;

  const months: MonthInfo[] = [];
  let year = rangeStart.getFullYear();
  let month = rangeStart.getMonth();
  for (
    let monthStart = new Date(year, month, 1);
    monthStart <= rangeEnd;
    monthStart = new Date(year, ++month, 1)
  ) {
    // Inclusive last day of the cell, at local midnight like every other date on
    // this grid — day 0 of next month is the last day of this one. Ending on
    // 23:59:59.999 instead would make the cell a day too wide and overlap its
    // neighbour. The constructor normalizes month 12 into January of next year.
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
 * `rangeStart` is derived from the task dates, so editing the YAML can move it.
 * Every offset in the chart is recomputed against the new origin, but the
 * browser's `scrollLeft` is a raw pixel value that survives the update — so a
 * roadmap that grows a new earliest task slides the whole grid right underneath
 * a viewport that stays put, silently showing an earlier date than before.
 *
 * Positive when `next` is earlier than `prev` (content moved right, so the
 * viewport has to follow it right); negative when the origin moved later.
 */
export function scrollShiftDays(prev: Date, next: Date): number {
  return daysBetween(next, prev);
}

/**
 * Day offset of `now`'s calendar day from `rangeStart`. Uncapped on purpose: a
 * roadmap entirely in the past or the future reports how far off today is, which
 * is what hides the marker and lets the browser clamp the initial scroll.
 *
 * `now`'s *local* calendar day is what counts — the grid is local, so reading
 * UTC date parts here would place today a day off for the width of the UTC
 * offset every day (evening hours west of UTC, small hours east of it).
 * `daysBetween` drops the clock time for us, so `now` can be an instant.
 */
export function todayOffset(rangeStart: Date, now: Date): number {
  return daysBetween(rangeStart, now);
}

/**
 * Whether `tasks` can produce a grid at all.
 *
 * `computeRange` takes `Math.min` over the task dates, which is `Infinity` for
 * an empty list — so an empty roadmap yields an Invalid Date origin and a NaN
 * width, and renders as a chart with no bars and no day columns rather than as
 * an error. Callers show an empty state instead.
 */
export function hasChartableRange(tasks: Task[]): boolean {
  return tasks.length > 0;
}
