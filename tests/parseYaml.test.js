import { describe, it, expect } from 'vitest';
import { parseYaml } from '../src/parseYaml.js';

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

  it('returns an empty array for an empty projects map', () => {
    const tasks = parseYaml('projects: {}');
    expect(tasks).toEqual([]);
  });

  it('throws on invalid YAML', () => {
    expect(() => parseYaml('{')).toThrow();
  });
});
