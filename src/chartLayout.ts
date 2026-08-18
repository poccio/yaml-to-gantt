/**
 * The chart's pixel grid, kept out of `timeline.ts`, which is date-space only.
 * Nothing here reads the DOM, so all of it is testable in the node suite.
 */

import type { Task } from './parseYaml';
import { daysBetween, parseDay } from './timeline';

export const BASE_DAY_W = 40;
export const LABEL_W = 280;

/**
 * A timeline shorter than the card stretches to fill it, so the chart does not
 * end in dead space; a longer one holds at `BASE_DAY_W` and scrolls rather than
 * compressing into an unreadable smear.
 */
export function effectiveDayW(containerWidth: number, totalDays: number): number {
  return containerWidth > 0
    ? Math.max(BASE_DAY_W, (containerWidth - LABEL_W) / totalDays)
    : BASE_DAY_W;
}

export function timelineMinW(totalDays: number): number {
  return totalDays * BASE_DAY_W;
}

/**
 * A row's full content width, label column included. Rows must be sized to this
 * rather than left to stretch to the card: a row is the containing block of its
 * own sticky label cell, and sticky cannot travel outside its containing block,
 * so a row ending at the visible width abandons the labels partway along a
 * scrolling timeline.
 */
export function rowMinW(totalDays: number): number {
  return LABEL_W + timelineMinW(totalDays);
}

/**
 * The day offset under the cursor, `null` when there is no day there.
 *
 * The label column is sticky and the timeline scrolls beneath it, so the
 * pointer's page-x means nothing until both are subtracted out. Two off-grid
 * cases: over the label column, and past the last day in the `flex: 1` slack of
 * the timeline cell.
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

/**
 * Is the day column starting at `offset` covered by the sticky label column?
 *
 * In timeline coordinates the label column's right edge *is* `scrollLeft`.
 * Callers use this to *not draw* what the label column would otherwise have to
 * hide: hiding by paint order only works for opaque paint, and a glow spills
 * past the edge of whatever covers it.
 *
 * A column straddling the edge counts as behind — the markers this guards are
 * drawn at the column's left edge, which is the pixel being asked about.
 */
export function isBehindLabelColumn({ offset, dayW, scrollLeft }: {
  offset: number;
  dayW: number;
  scrollLeft: number;
}): boolean {
  return offset * dayW < scrollLeft;
}

/**
 * `clip-path` for the today bar, letting its glow reach left only as far as the
 * label column's edge.
 *
 * The bar is never drawn behind the labels, but it is drawn *flush against* them
 * — and `blur` around a 2px line reaches well past the edge, onto labels that sit
 * inside faded rows and cannot outrank it. Nothing is lost by cutting it:
 * everything left of that edge is under an opaque column anyway.
 */
export function todayBarClip({ x, scrollLeft, blur }: {
  x: number;
  scrollLeft: number;
  blur: number;
}): string {
  const leftReach = Math.min(blur, Math.max(0, x - scrollLeft));
  return `inset(${-blur}px ${-blur}px ${-blur}px ${-leftReach}px)`;
}

// The hover pill is 13px monospace with 9px of side padding. Approximated for
// the same reason `chipX` approximates chips: the position is decided during
// render, before there is a DOM node to measure.
const PILL_CHAR_W = 7.2;
const PILL_PADDING_X = 9;

export function hoverPillW(label: string): number {
  return label.length * PILL_CHAR_W + PILL_PADDING_X * 2;
}

/**
 * Where to centre the hover pill, which is the middle of the hovered day column
 * unless that puts the pill under the label column.
 *
 * The cursor cannot reach the label column, so the hovered day is always at
 * least partly visible — but the *leftmost* visible column can be mostly
 * covered, and a pill centred on it then sits half under an opaque column
 * reading "g 1". A floor, not a snap: a column that already clears the edge is
 * left alone.
 */
export function hoverPillCenter({ offset, dayW, scrollLeft, pillW }: {
  offset: number;
  dayW: number;
  scrollLeft: number;
  pillW: number;
}): number {
  return Math.max(offset * dayW + dayW / 2, scrollLeft + pillW / 2);
}

export interface BarGeometry {
  barLeft: number;
  barW: number;
  /** The original-plan outline, or `null` when the task has no baseline. */
  ghost: { left: number; width: number } | null;
}

/** Floor on a bar's width, so a one-day task stays visible and hoverable. */
const MIN_BAR_W = 8;

/**
 * Width of the ghost outline's dashed stroke. Exported because the geometry
 * below grows the box by it, so the renderer cannot pick its own.
 */
export const GHOST_BORDER_W = 1.5;

/**
 * End dates are inclusive: a Jul 1 to Jul 11 task covers eleven columns. A
 * baseline needs both `originallyPlanned` dates; one alone is ignored rather
 * than half-drawn from the grid origin.
 */
export function taskBarGeometry(task: Task, rangeStart: Date, dayW: number): BarGeometry {
  const startOff = daysBetween(rangeStart, parseDay(task.start));
  const endOff = daysBetween(rangeStart, parseDay(task.end));

  const hasBaseline = !!task.originallyPlannedStart && !!task.originallyPlannedEnd;
  let ghost: BarGeometry['ghost'] = null;
  if (hasBaseline) {
    const baseStartOff = daysBetween(rangeStart, parseDay(task.originallyPlannedStart!));
    const baseEndOff = daysBetween(rangeStart, parseDay(task.originallyPlannedEnd!));
    // The outline hugs the baseline span from *outside*: `border-box` draws the
    // stroke inside the box, so on a date the bar shares it lands under the bar
    // and gets painted over, leaving the dashes bitten out between the bar's
    // rounded corners. Growing by the stroke keeps the box's inner edge on the
    // day boundary.
    ghost = {
      left: baseStartOff * dayW - GHOST_BORDER_W,
      width: Math.max((baseEndOff - baseStartOff + 1) * dayW, MIN_BAR_W) + 2 * GHOST_BORDER_W,
    };
  }

  return {
    barLeft: startOff * dayW,
    barW: Math.max((endOff - startOff + 1) * dayW, MIN_BAR_W),
    ghost,
  };
}

// `chipX` decides during render, before the DOM can be measured, so these
// approximate a monospace 13px chip.
const CHIP_CHAR_W = 6.2;
const CHIP_PADDING = 12;
const CHIP_GAP = 3;

/**
 * Chips sit past the right end of the bar, unless that runs them off the grid
 * where they would be clipped — then they flip to its left, but only if there is
 * room: a bar that overflows right and starts near the origin keeps its chips on
 * the right rather than flipping to a negative offset.
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
