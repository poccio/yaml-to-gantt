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

/**
 * A `YYYY-MM-DD` date read as *local* midnight. Everything in the chart sits on
 * this grid, so reading these as UTC instead would shift every bar by a day for
 * any viewer west of UTC.
 */
export function parseDay(s: string): Date {
  return new Date(s + 'T00:00:00');
}

/** Whole days from `a` to `b`, rounded so a 23- or 25-hour DST day still counts as one. */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
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

  const rangeStart = new Date(minDate);
  rangeStart.setDate(rangeStart.getDate() - RANGE_PAD);
  rangeStart.setHours(0, 0, 0, 0);

  const rangeEnd = new Date(maxDate);
  rangeEnd.setDate(rangeEnd.getDate() + RANGE_PAD + 2);

  const totalDays = daysBetween(rangeStart, rangeEnd) + 1;

  const firstMonday = new Date(rangeStart);
  while (firstMonday.getDay() !== 1) firstMonday.setDate(firstMonday.getDate() + 1);
  const firstMondayOffset = daysBetween(rangeStart, firstMonday);

  const months: MonthInfo[] = [];
  const cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
  while (cursor <= rangeEnd) {
    const mStart = new Date(Math.max(cursor.getTime(), rangeStart.getTime()));
    const nextMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    // Inclusive last day of the cell, at local midnight like every other date on
    // this grid — day 0 of next month is the last day of this one. Ending on
    // 23:59:59.999 instead would make daysBetween round a day up, so every cell
    // but the last came out one day too wide and overlapped its neighbour.
    const lastOfMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const mEnd = new Date(Math.min(lastOfMonth.getTime(), rangeEnd.getTime()));
    months.push({
      label: cursor.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
      offset: daysBetween(rangeStart, mStart),
      width: daysBetween(mStart, mEnd) + 1,
    });
    cursor.setTime(nextMonth.getTime());
  }

  return { rangeStart, totalDays, months, firstMondayOffset };
}

/**
 * Day offset of `now`'s calendar day from `rangeStart`. Uncapped on purpose: a
 * roadmap entirely in the past or the future reports how far off today is, which
 * is what hides the marker and lets the browser clamp the initial scroll.
 *
 * `now`'s *local* calendar day is what counts — the grid is local, so reading
 * UTC date parts here would place today a day off for the width of the UTC
 * offset every day (evening hours west of UTC, small hours east of it).
 */
export function todayOffset(rangeStart: Date, now: Date): number {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return daysBetween(rangeStart, today);
}
