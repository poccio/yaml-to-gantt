import { describe, test, expect } from 'vitest';
import { placePopover } from '../src/popover';

const VIEWPORT = { width: 1440, height: 900 };

/** The 18px round "?" marker the popover hangs off, at an arbitrary position. */
function anchor(overrides: Partial<{ top: number; bottom: number; left: number; width: number }> = {}) {
  return { top: 100, bottom: 118, left: 500, width: 18, ...overrides };
}

describe('placePopover', () => {
  // The common case: hang below the marker, centred on it.
  test('places below when there is room below', () => {
    // centre x = 509, so left = 509 − 320/2 = 349; top = bottom(118) + GAP(10).
    expect(placePopover(anchor(), 200, VIEWPORT)).toEqual({
      top: 128, left: 349, caretLeft: 160, placement: 'below',
    });
  });

  // A marker near the bottom of the window has to flip, or the popover runs
  // off the screen and the description is unreadable.
  test('flips above when below would overflow', () => {
    // spaceBelow = 900 − 818 = 82, short of 200 + 10 + 8; anchor.top 800 is not.
    expect(placePopover(anchor({ top: 800, bottom: 818 }), 200, VIEWPORT)).toEqual({
      top: 590, left: 349, caretLeft: 160, placement: 'above',
    });
  });

  // A popover taller than the viewport fits nowhere. It must still land on
  // screen rather than at a negative top, so it is pinned to the bottom margin.
  test('pins to the bottom margin when neither side fits', () => {
    // 800 tall: spaceBelow 782 and spaceAbove 100 both fall short.
    // top = max(MARGIN 8, 900 − 800 − 8) = 92.
    expect(placePopover(anchor(), 800, VIEWPORT)).toEqual({
      top: 92, left: 349, caretLeft: 160, placement: 'below',
    });
  });

  // Centring on a marker near the right edge would push the box off screen.
  // The caret has to stay on the marker even after the box stops following it.
  test('clamps to the right margin and keeps the caret on the anchor', () => {
    // centre 1409; unclamped left 1249 exceeds 1440 − 320 − 8 = 1112.
    expect(placePopover(anchor({ left: 1400 }), 200, VIEWPORT)).toEqual({
      top: 128, left: 1112, caretLeft: 297, placement: 'below',
    });
  });

  // Mirror case at the left edge, where the caret's own clamp binds: the
  // anchor centre is only 1px from the box edge, inside the 16px caret inset.
  test('clamps to the left margin and floors the caret inset', () => {
    expect(placePopover(anchor({ left: 0 }), 200, VIEWPORT)).toEqual({
      top: 128, left: 8, caretLeft: 16, placement: 'below',
    });
  });
});
