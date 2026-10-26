import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { layoutPeriods, periodTitle } from '../src/periods';
import type { Period } from '../src/parseYaml';

// Pinned for the same reason tests/timeline.test.ts pins it; Nov 1 2026, a
// 25-hour day there, sits inside the fixtures below.
const ZONE = 'America/New_York';
let originalTZ: string | undefined;

beforeAll(() => {
  originalTZ = process.env.TZ;
  process.env.TZ = ZONE;
});

afterAll(() => {
  if (originalTZ === undefined) delete process.env.TZ;
  else process.env.TZ = originalTZ;
});

// A function, not a constant: module scope runs before `beforeAll` pins the
// zone, and a Date built there is midnight somewhere else.
const monOct26 = () => new Date(2026, 9, 26);

function periods(...rows: Array<[string, string, string]>): Period[] {
  return rows.map(([name, start, end]) => ({ name, start, end }));
}

describe('layoutPeriods', () => {
  test('places a period by its inclusive day offsets across a DST transition', () => {
    const [span] = layoutPeriods(periods(['Sprint 42', '2026-10-26', '2026-11-06']), monOct26());

    expect([span.startOff, span.endOff]).toEqual([0, 11]);
  });

  test('alternates hue through back-to-back periods', () => {
    const spans = layoutPeriods(periods(
      ['S1', '2026-10-26', '2026-11-08'],
      ['S2', '2026-11-09', '2026-11-22'],
      ['S3', '2026-11-23', '2026-12-06'],
    ), monOct26());

    expect(spans.map(s => s.hue)).toEqual([0, 1, 0]);
    expect(spans.map(s => s.abutsNext)).toEqual([true, true, false]);
  });

  // Mon–Fri sprints leave a Sat–Sun gap; treating it as a break made every
  // sprint the same hue and the cadence one undivided wash.
  test('keeps alternating across a gap of only a weekend', () => {
    const spans = layoutPeriods(periods(
      ['S1', '2026-10-26', '2026-11-06'],
      ['S2', '2026-11-09', '2026-11-20'],
      ['S3', '2026-11-23', '2026-12-04'],
    ), monOct26());

    expect(spans.map(s => s.hue)).toEqual([0, 1, 0]);
    expect(spans.map(s => s.abutsNext)).toEqual([false, false, false]);
  });

  test('restarts on the first hue after a gap that holds a weekday', () => {
    // Fri Oct 30, then Tue Nov 3: the Monday between breaks the run.
    const spans = layoutPeriods(periods(
      ['A', '2026-10-26', '2026-10-30'],
      ['B', '2026-11-03', '2026-11-06'],
    ), monOct26());

    expect(spans.map(s => s.hue)).toEqual([0, 0]);
  });

  test('returns nothing for no periods', () => {
    expect(layoutPeriods([], monOct26())).toEqual([]);
  });
});

describe('periodTitle', () => {
  test('names the dates and the length', () => {
    expect(periodTitle({ name: 'Sprint 42', start: '2026-10-26', end: '2026-11-06' }))
      .toBe('Sprint 42 · Oct 26 → Nov 6 · 12 days');
  });

  test('prints a one-day period as a single date', () => {
    expect(periodTitle({ name: 'GA', start: '2026-11-23', end: '2026-11-23' }))
      .toBe('GA · Nov 23 · 1 day');
  });
});
