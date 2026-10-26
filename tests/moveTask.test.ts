import { describe, it, expect } from 'vitest';
import { moveTask, MoveRefused } from '../server/moveTask.js';

const BASE = [
  'projects:',
  '  # roadmap',
  '  Product Launch:',
  '    - name: Market research   # first',
  '      start: 2025-07-01',
  '      end: 2025-07-11 # inclusive',
  '      assignees: [Alice]',
  '    - name: Landing page',
  "      start: '2025-07-07'",
  '      end: "2025-07-24"',
  '      originallyPlannedStart: 2025-07-07',
  '      originallyPlannedEnd: 2025-07-18',
  '',
].join('\n');

const move = (over: Partial<Parameters<typeof moveTask>[1]> = {}) => ({
  project: 'Product Launch',
  index: 0,
  start: '2025-07-03',
  end: '2025-07-13',
  ...over,
});

const wrap = (task: string[]) => ['projects:', '  P:', ...task, ''].join('\n');

describe('moveTask', () => {
  it('moves the dates and records the baseline after the end line, leaving every other byte alone', () => {
    const expected = BASE
      .replace('start: 2025-07-01', 'start: 2025-07-03')
      .replace(
        'end: 2025-07-11 # inclusive\n',
        'end: 2025-07-13 # inclusive\n' +
          '      originallyPlannedStart: 2025-07-01\n' +
          '      originallyPlannedEnd: 2025-07-11\n',
      );
    expect(moveTask(BASE, move())).toBe(expected);
  });

  it("keeps each date's quote style and leaves an existing baseline untouched", () => {
    const out = moveTask(BASE, move({ index: 1, start: '2025-07-10', end: '2025-07-27' }));
    expect(out).toContain("      start: '2025-07-10'");
    expect(out).toContain('      end: "2025-07-27"');
    expect(out).toContain('      originallyPlannedStart: 2025-07-07\n      originallyPlannedEnd: 2025-07-18\n');
  });

  it("gives the inserted baseline the old dates' quote styles", () => {
    const text = wrap([
      '    - name: Q',
      "      start: '2025-07-01'",
      '      end: "2025-07-11"',
    ]);
    const out = moveTask(text, move({ project: 'P', index: 0 }));
    expect(out).toContain("      originallyPlannedStart: '2025-07-01'\n");
    expect(out).toContain('      originallyPlannedEnd: "2025-07-11"');
  });

  it('leaves a half baseline alone', () => {
    const text = wrap([
      '    - name: X',
      '      start: 2025-07-01',
      '      end: 2025-07-11',
      '      originallyPlannedStart: 2025-06-30',
    ]);
    const out = moveTask(text, move({ project: 'P' }));
    expect(out).toBe(
      text.replace('start: 2025-07-01', 'start: 2025-07-03').replace('end: 2025-07-11', 'end: 2025-07-13'),
    );
  });

  it('fills empty baseline keys in place', () => {
    const text = wrap([
      '    - name: X',
      '      start: 2025-07-01',
      '      end: 2025-07-11',
      '      originallyPlannedStart:',
      '      originallyPlannedEnd:',
    ]);
    const out = moveTask(text, move({ project: 'P' }));
    expect(out).toContain('      originallyPlannedStart: 2025-07-01\n      originallyPlannedEnd: 2025-07-11\n');
    expect(out.match(/originallyPlannedStart/g)!.length).toBe(1);
  });

  it('fills empty baseline keys written with a space before the colon', () => {
    const text = wrap([
      '    - name: X',
      '      start: 2025-07-01',
      '      end: 2025-07-11',
      '      originallyPlannedStart :',
      '      originallyPlannedEnd :',
    ]);
    expect(moveTask(text, move({ project: 'P' }))).toBe(
      wrap([
        '    - name: X',
        '      start: 2025-07-03',
        '      end: 2025-07-13',
        '      originallyPlannedStart : 2025-07-01',
        '      originallyPlannedEnd : 2025-07-11',
      ]),
    );
  });

  it("inserts with the file's own line endings", () => {
    const out = moveTask(BASE.replaceAll('\n', '\r\n'), move());
    expect(/(?<!\r)\n/.test(out)).toBe(false);
    expect(out).toContain('originallyPlannedStart: 2025-07-01');
  });

  it('inserts on its own lines when the end line has no final newline', () => {
    const text = ['projects:', '  P:', '    - name: X', '      start: 2025-07-01', '      end: 2025-07-11'].join('\n');
    const tail =
      'end: 2025-07-13\n      originallyPlannedStart: 2025-07-01\n      originallyPlannedEnd: 2025-07-11';
    expect(moveTask(text, move({ project: 'P' })).endsWith(tail)).toBe(true);
    expect(moveTask(text + '\n', move({ project: 'P' })).endsWith(tail + '\n')).toBe(true);
  });

  it('finds an integer-like project key', () => {
    const text = 'projects:\n  2026:\n    - name: X\n      start: 2025-07-01\n      end: 2025-07-11\n';
    expect(moveTask(text, move({ project: '2026' }))).toContain('start: 2025-07-03');
  });

  it('refuses a flow-style task', () => {
    const text = wrap(['    - { name: X, start: 2025-07-01, end: 2025-07-02 }']);
    expect(() => moveTask(text, move({ project: 'P' }))).toThrow(MoveRefused);
    expect(() => moveTask(text, move({ project: 'P' }))).toThrow(/flow/);
  });

  it('refuses an unknown project or task', () => {
    expect(() => moveTask(BASE, move({ project: 'Nope' }))).toThrow(/not found/);
    expect(() => moveTask(BASE, move({ index: 5 }))).toThrow(/not found/);
    expect(() => moveTask(BASE, move({ index: 5 }))).toThrow(MoveRefused);
  });

  it('refuses anchors, aliases and merge keys', () => {
    const cases = [
      wrap(['    - name: X', '      start: &s 2025-07-01', '      end: 2025-07-11']),
      ['projects:', '  P:', '    - &base', '      name: X', '      start: 2025-07-01', '      end: 2025-07-11', '    - *base', ''].join('\n'),
      wrap(['    - name: X', '      <<: *base', '      start: 2025-07-01', '      end: 2025-07-11']),
    ];
    const targets = [0, 1, 0];
    cases.forEach((text, i) => {
      expect(() => moveTask(text, move({ project: 'P', index: targets[i] }))).toThrow(/anchor|alias|merge/);
    });
  });

  it('refuses bad dates', () => {
    expect(() => moveTask(BASE, move({ start: '2025-13-01' }))).toThrow(/YYYY-MM-DD/);
    expect(() => moveTask(BASE, move({ start: '2025-07-10', end: '2025-07-09' }))).toThrow(/before/);
  });
});
