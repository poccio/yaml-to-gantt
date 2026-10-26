import { describe, test, expect } from 'vitest';
import { toggleAssignee, pruneAssigneeFilter } from '../src/assigneeFilter';

describe('toggleAssignee', () => {
  test('selects only the clicked name from All', () => {
    expect(toggleAssignee(null, 'Bob', ['Alice', 'Bob'])).toEqual(new Set(['Bob']));
  });

  test('collapses to All when emptied or full', () => {
    expect(toggleAssignee(new Set(['Bob']), 'Bob', ['Alice', 'Bob'])).toBeNull();
    expect(toggleAssignee(new Set(['Bob']), 'Alice', ['Alice', 'Bob'])).toBeNull();
  });
});

describe('pruneAssigneeFilter', () => {
  test('keeps a selection that still exists', () => {
    expect(pruneAssigneeFilter(new Set(['Bob']), ['Alice', 'Bob', 'Carol'])).toEqual(new Set(['Bob']));
  });

  test('drops names that vanished', () => {
    expect(pruneAssigneeFilter(new Set(['Bob', 'Dan']), ['Alice', 'Bob', 'Carol'])).toEqual(new Set(['Bob']));
  });

  test('falls back to All when nothing or everyone remains', () => {
    expect(pruneAssigneeFilter(new Set(['Dan']), ['Alice'])).toBeNull();
    expect(pruneAssigneeFilter(new Set(['Alice']), ['Alice'])).toBeNull();
    expect(pruneAssigneeFilter(null, ['Alice'])).toBeNull();
  });
});
