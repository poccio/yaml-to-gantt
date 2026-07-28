/**
 * The chart's pixel grid.
 *
 * Kept out of `timeline.ts` on purpose: that module is date-space only —
 * calendar days, DST, no pixels anywhere — and mixing the two dissolves the
 * one boundary it holds. Everything here is a total function of its arguments,
 * so it lives in the node test suite rather than needing a DOM.
 */

import type { Task } from './parseYaml';
import { daysBetween, parseDay } from './timeline';

/** Width of one day column at rest, before any stretch to fill the card. */
export const DAY_W = 40;
/** Width of the sticky task-label column on the left of every row. */
export const LABEL_W = 280;

/**
 * Day-column width actually used for rendering.
 *
 * A timeline shorter than the card stretches to fill it, so the chart does not
 * end in dead space. A longer one holds at `DAY_W` and scrolls instead of
 * compressing. Returns `DAY_W` before the container has been measured.
 */
export function effectiveDayW(containerWidth: number, totalDays: number): number {
  return containerWidth > 0
    ? Math.max(DAY_W, (containerWidth - LABEL_W) / totalDays)
    : DAY_W;
}

/**
 * The day offset under the cursor, or `null` when the cursor is not over a day.
 *
 * The label column is sticky and the timeline scrolls beneath it, so the page-x
 * of the pointer means nothing until both are subtracted out. `null` covers the
 * two off-grid cases: over the label column, and past the end of the grid in
 * the `flex: 1` slack of the timeline cell.
 */
export function hoverOffsetAt({
  clientX, containerLeft, scrollLeft, dayW, totalDays,
}: {
  clientX: number;
  containerLeft: number;
  scrollLeft: number;
  dayW: number;
  totalDays: number;
}): number | null {
  const xInTimeline = clientX - containerLeft - LABEL_W + scrollLeft;
  if (xInTimeline < 0) return null;
  const offset = Math.floor(xInTimeline / dayW);
  return offset >= 0 && offset < totalDays ? offset : null;
}

export interface BarGeometry {
  barLeft: number;
  barW: number;
  /** The original-plan outline, or `null` when the task has no baseline. */
  ghost: { left: number; width: number } | null;
}

/** Absolute floor on a bar's width, so a one-day task stays hoverable. */
const MIN_BAR_W = 8;

/**
 * Where a task's bar — and its baseline ghost, if it has one — sit on the grid.
 *
 * End dates are inclusive: a Jul 1 to Jul 11 task covers eleven columns. A
 * baseline needs both `originallyPlanned` dates; one alone describes no bar, so
 * it is ignored rather than half-drawn from the grid origin.
 */
export function taskBarGeometry(task: Task, rangeStart: Date, dayW: number): BarGeometry {
  const startOff = daysBetween(rangeStart, parseDay(task.start));
  const endOff = daysBetween(rangeStart, parseDay(task.end));

  const hasBaseline = !!task.originallyPlannedStart && !!task.originallyPlannedEnd;
  let ghost: BarGeometry['ghost'] = null;
  if (hasBaseline) {
    const baseStartOff = daysBetween(rangeStart, parseDay(task.originallyPlannedStart!));
    const baseEndOff = daysBetween(rangeStart, parseDay(task.originallyPlannedEnd!));
    ghost = {
      left: baseStartOff * dayW,
      width: Math.max((baseEndOff - baseStartOff + 1) * dayW, MIN_BAR_W),
    };
  }

  return {
    barLeft: startOff * dayW,
    barW: Math.max((endOff - startOff + 1) * dayW, MIN_BAR_W),
    ghost,
  };
}

// Chips are measured, not laid out — the flip decision happens during render,
// before the DOM exists. These approximate a monospace 13px chip: per-character
// advance, horizontal padding, and the flex gap between adjacent chips.
const CHIP_CHAR_W = 6.2;
const CHIP_PADDING = 12;
const CHIP_GAP = 3;

/**
 * Left offset for a task's assignee chips.
 *
 * They sit past the right end of the bar, unless that would run them off the
 * grid — then they flip to the bar's left, but only if there is room there.
 * A bar that overflows on the right and starts near the origin keeps its chips
 * on the right rather than flipping to a negative offset.
 */
export function chipX({
  barLeft, barW, assignees, totalDays, dayW,
}: {
  barLeft: number;
  barW: number;
  assignees: string[];
  totalDays: number;
  dayW: number;
}): number {
  const approxChipW =
    assignees.reduce((sum, a) => sum + a.length * CHIP_CHAR_W + CHIP_PADDING, 0) +
    Math.max(0, assignees.length - 1) * CHIP_GAP;

  const chipAtRight = barLeft + barW + 6;
  const overflowsRight = chipAtRight + approxChipW > totalDays * dayW - 4;
  const fitsLeft = barLeft > approxChipW + 8;

  return overflowsRight && fitsLeft ? barLeft - approxChipW - 6 : chipAtRight;
}
