/**
 * Periods laid out on the day grid. Day-space only, like `timeline.ts`; the
 * renderer multiplies by `dayW` the same way it does for month cells.
 */

import type { Period } from './parseYaml';
import { addDays, daysBetween, parseDay, shortDay } from './timeline';

/**
 * `alternate` is the lighter wash. Back-to-back periods alternate so a cadence
 * reads as distinct blocks rather than one tint across the whole chart.
 */
export type PeriodTone = 'primary' | 'alternate';

export interface PeriodSpan {
  period: Period;
  startOff: number;
  /** Inclusive. */
  endOff: number;
  tone: PeriodTone;
  /**
   * The next period starts the very next day. Its left edge line
   * is then this one's right edge, and drawing both doubles it into a 2px rule.
   */
  abutsNext: boolean;
}

/**
 * Whether two periods belong to one cadence: nothing but weekend days between
 * them. Sprints are as often written Mon–Fri as Mon–Sun, and the first spelling
 * leaves a Sat–Sun gap that must not restart the alternation, or every sprint
 * comes out `primary` and the blocks merge.
 */
function continuesRun(prevEnd: Date, nextStart: Date): boolean {
  const gap = daysBetween(prevEnd, nextStart) - 1;
  for (let i = 1; i <= gap; i++) {
    const dow = addDays(prevEnd, i).getDay();
    if (dow !== 0 && dow !== 6) return false;
  }
  return true;
}

/** Periods on the grid. Expects them sorted and non-overlapping, as `parseYaml` leaves them. */
export function layoutPeriods(periods: Period[], rangeStart: Date): PeriodSpan[] {
  const spans: PeriodSpan[] = [];
  periods.forEach((period, i) => {
    const start = parseDay(period.start);
    const end = parseDay(period.end);
    const prev = periods[i - 1];
    const next = periods[i + 1];
    const tone: PeriodTone =
      prev && spans[i - 1].tone === 'primary' && continuesRun(parseDay(prev.end), start)
        ? 'alternate'
        : 'primary';
    spans.push({
      period,
      startOff: daysBetween(rangeStart, start),
      endOff: daysBetween(rangeStart, end),
      tone,
      abutsNext: !!next && daysBetween(end, parseDay(next.start)) === 1,
    });
  });
  return spans;
}

/** The header segment's tooltip, e.g. `Sprint 42 · Oct 26 → Nov 6 · 12 days`. */
export function periodTitle(p: Period): string {
  const days = daysBetween(parseDay(p.start), parseDay(p.end)) + 1;
  const dates = days === 1 ? shortDay(p.start) : `${shortDay(p.start)} → ${shortDay(p.end)}`;
  return `${p.name} · ${dates} · ${days} ${days === 1 ? 'day' : 'days'}`;
}
