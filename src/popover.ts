/**
 * Placement geometry for the task-description popover. Takes an anchor rect and
 * an explicit viewport rather than reading `window`, so it is testable in the
 * node suite — jsdom would not help, having no layout engine to measure with.
 */

export const POPOVER_W = 320;
/** Drawn by the component; placement never reads it. */
export const CARET_HALF_EDGE = 7;
const POP_GAP = 10;
const POP_MARGIN = 8;

/** The subset of `DOMRect` placement reads, so a test needs no real rect. */
export interface AnchorRect {
  top: number;
  bottom: number;
  left: number;
  width: number;
}

export interface PopoverPos {
  top: number;
  left: number;
  /** Caret offset from the popover's own left edge, not from the viewport. */
  caretLeft: number;
  placement: 'above' | 'below';
}

export function placePopover(
  anchor: AnchorRect,
  height: number,
  viewport: { width: number; height: number },
): PopoverPos {
  const anchorCenterX = anchor.left + anchor.width / 2;

  let left = anchorCenterX - POPOVER_W / 2;
  left = Math.max(POP_MARGIN, Math.min(left, viewport.width - POPOVER_W - POP_MARGIN));

  const spaceBelow = viewport.height - anchor.bottom;
  let placement: 'above' | 'below';
  let top: number;
  if (spaceBelow >= height + POP_GAP + POP_MARGIN) {
    placement = 'below';
    top = anchor.bottom + POP_GAP;
  } else if (anchor.top >= height + POP_GAP + POP_MARGIN) {
    placement = 'above';
    top = anchor.top - POP_GAP - height;
  } else {
    // Taller than either gap: pin to the bottom margin rather than run off the
    // top at a negative `top`.
    placement = 'below';
    top = Math.max(POP_MARGIN, viewport.height - height - POP_MARGIN);
  }

  // Where the box was clamped it no longer follows the anchor, so the caret does
  // — up to its own inset, which keeps it clear of the rounded corners.
  let caretLeft = anchorCenterX - left;
  caretLeft = Math.max(16, Math.min(caretLeft, POPOVER_W - 16));

  return { top, left, caretLeft, placement };
}
