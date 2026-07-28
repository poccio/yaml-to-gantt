import { describe, it, expect } from 'vitest';
import { parseYaml } from '../src/parseYaml';

const SINGLE_PROJECT_YAML = `
projects:
  Project A:
    - name: Task 1
      start: 2026-04-06
      end: 2026-04-10
      assignees:
        - Alice
        - Bob
    - name: Task 2
      start: 2026-04-13
      end: 2026-04-17
      assignees: []
`;

const MULTI_PROJECT_YAML = `
projects:
  Alpha:
    - name: A1
      start: 2026-04-01
      end: 2026-04-05
      assignees: []
  Beta:
    - name: B1
      start: 2026-04-06
      end: 2026-04-10
      assignees:
        - Carol
`;

describe('parseYaml', () => {
  it('flattens a single project into task records', () => {
    const tasks = parseYaml(SINGLE_PROJECT_YAML);
    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toEqual({
      project: 'Project A',
      name: 'Task 1',
      start: '2026-04-06',
      end: '2026-04-10',
      assignees: ['Alice', 'Bob'],
    });
    expect(tasks[1]).toEqual({
      project: 'Project A',
      name: 'Task 2',
      start: '2026-04-13',
      end: '2026-04-17',
      assignees: [],
    });
  });

  it('preserves project order across multiple projects', () => {
    const tasks = parseYaml(MULTI_PROJECT_YAML);
    expect(tasks).toHaveLength(2);
    expect(tasks[0].project).toBe('Alpha');
    expect(tasks[1].project).toBe('Beta');
  });

  it('returns start and end as YYYY-MM-DD strings (not Date objects)', () => {
    const tasks = parseYaml(SINGLE_PROJECT_YAML);
    expect(typeof tasks[0].start).toBe('string');
    expect(tasks[0].start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('defaults assignees to [] when the field is absent', () => {
    const yaml = `
projects:
  Solo:
    - name: No Assignees Task
      start: 2026-04-01
      end: 2026-04-05
`;
    const tasks = parseYaml(yaml);
    expect(tasks[0].assignees).toEqual([]);
  });

  it('passes through an optional description verbatim', () => {
    const yaml = `
projects:
  Solo:
    - name: Described Task
      start: 2026-04-01
      end: 2026-04-05
      description: "Ship the <b>v2</b> API."
`;
    const tasks = parseYaml(yaml);
    expect(tasks[0].description).toBe('Ship the <b>v2</b> API.');
  });

  it('leaves description undefined when the field is absent', () => {
    const tasks = parseYaml(SINGLE_PROJECT_YAML);
    expect(tasks[0].description).toBeUndefined();
  });

  it('returns an empty array for an empty projects map', () => {
    const tasks = parseYaml('projects: {}');
    expect(tasks).toEqual([]);
  });

  it('throws on invalid YAML', () => {
    expect(() => parseYaml('{')).toThrow();
  });

  it('parses baseline dates when both are present', () => {
    const yaml = `
projects:
  Solo:
    - name: Slipped Task
      start: 2026-04-13
      end: 2026-04-24
      originallyPlannedStart: 2026-04-06
      originallyPlannedEnd: 2026-04-17
`;
    const tasks = parseYaml(yaml);
    expect(tasks[0].originallyPlannedStart).toBe('2026-04-06');
    expect(tasks[0].originallyPlannedEnd).toBe('2026-04-17');
  });

  it('ignores a lone baseline field (both must be present)', () => {
    const yaml = `
projects:
  Solo:
    - name: Half Baseline
      start: 2026-04-13
      end: 2026-04-24
      originallyPlannedEnd: 2026-04-17
`;
    const tasks = parseYaml(yaml);
    expect(tasks[0].originallyPlannedStart).toBeUndefined();
    expect(tasks[0].originallyPlannedEnd).toBeUndefined();
  });

  it('ignores a lone originallyPlannedStart (the symmetric case)', () => {
    const yaml = `
projects:
  Solo:
    - name: Half Baseline
      start: 2026-04-13
      end: 2026-04-24
      originallyPlannedStart: 2026-04-06
`;
    const tasks = parseYaml(yaml);
    expect(tasks[0].originallyPlannedStart).toBeUndefined();
    expect(tasks[0].originallyPlannedEnd).toBeUndefined();
  });

  it('leaves baseline fields undefined when absent', () => {
    const tasks = parseYaml(SINGLE_PROJECT_YAML);
    expect(tasks[0].originallyPlannedStart).toBeUndefined();
    expect(tasks[0].originallyPlannedEnd).toBeUndefined();
  });

  it('accepts a quoted date, which js-yaml hands over as a plain string', () => {
    const yaml = `
projects:
  Solo:
    - name: Quoted
      start: "2026-04-01"
      end: "2026-04-05"
`;
    const tasks = parseYaml(yaml);
    expect(tasks[0].start).toBe('2026-04-01');
    expect(tasks[0].end).toBe('2026-04-05');
  });

  // A bad date used to reach parseDay as an Invalid Date, which made computeRange
  // return NaN and blanked every bar in the chart, not just this one.
  it.each([
    ['garbage', 'not-a-date'],
    ['an unpadded month and day', '2025-7-1'],
    ['month 13, which the Date constructor would roll into next year', '2025-13-01'],
    ['a day that does not exist in that month', '2026-02-30'],
    ['a trailing time', '2026-04-01T00:00:00Z'],
  ])('rejects %s', (_label, value) => {
    const yaml = `
projects:
  Solo:
    - name: Junk date
      start: "${value}"
      end: 2026-08-10
`;
    expect(() => parseYaml(yaml)).toThrow(/start must be a YYYY-MM-DD date/);
  });

  it('names the project and task in the error so the row can be found', () => {
    const yaml = `
projects:
  Product Launch:
    - name: Beta release
      start: 2026-04-01
      end: "later"
`;
    expect(() => parseYaml(yaml)).toThrow('Product Launch / Beta release: end must be a YYYY-MM-DD date, got "later"');
  });

  it('rejects a bad baseline date too', () => {
    const yaml = `
projects:
  Solo:
    - name: Slipped
      start: 2026-04-13
      end: 2026-04-24
      originallyPlannedStart: "nope"
      originallyPlannedEnd: 2026-04-17
`;
    expect(() => parseYaml(yaml)).toThrow(/originallyPlannedStart must be a YYYY-MM-DD date/);
  });

  it('rejects a task with a missing start date', () => {
    const yaml = `
projects:
  Solo:
    - name: No Start
      end: 2026-04-05
`;
    expect(() => parseYaml(yaml)).toThrow(/start must be a YYYY-MM-DD date/);
  });

  it('coerces Date-object baseline values to YYYY-MM-DD strings', () => {
    const yaml = `
projects:
  Solo:
    - name: Date Baseline
      start: 2026-04-13
      end: 2026-04-24
      originallyPlannedStart: 2026-04-06
      originallyPlannedEnd: 2026-04-17
`;
    const tasks = parseYaml(yaml);
    expect(typeof tasks[0].originallyPlannedStart).toBe('string');
    expect(tasks[0].originallyPlannedStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
