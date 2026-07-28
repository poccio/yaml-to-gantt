/**
 * Placement geometry for the task-description popover.
 *
 * Deliberately free of the DOM: it takes a structural anchor rect and an
 * explicit viewport rather than reading `window`, so it is a total function of
 * its arguments and testable in the node suite. jsdom would be no help here
 * anyway — it has no layout engine, so a real rect measured under it is all
 * zeroes.
 */

export const POPOVER_W = 320;
/**
 * Half the caret square's edge. Placement never reads it — the caret is drawn
 * by the component's CSS — but it belongs with the other popover dimensions.
 */
export const CARET_SIZE = 7;
const POP_GAP = 10;
const POP_MARGIN = 8;

/** The structural subset of `DOMRect` that placement actually reads. */
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
    // Taller than either gap. Pin to the bottom margin rather than let it run
    // off the top with a negative `top`.
    placement = 'below';
    top = Math.max(POP_MARGIN, viewport.height - height - POP_MARGIN);
  }

  // Once the box stops following the anchor (clamped above), the caret keeps
  // pointing at it — up to its own inset from the box's rounded corners.
  let caretLeft = anchorCenterX - left;
  caretLeft = Math.max(16, Math.min(caretLeft, POPOVER_W - 16));

  return { top, left, caretLeft, placement };
}
