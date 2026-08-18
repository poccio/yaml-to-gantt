import { describe, test, expect } from 'vitest';
import { readUrlOptions } from '../src/urlOptions';

// The CLI hands its flags to the client through the query string (bin/cli.ts),
// coupled to this parser by nothing but the literals below — which are the URLs
// bin/cli.ts actually emits, so change both together.
describe('readUrlOptions', () => {
  test('reads the file path the CLI passes, percent-decoded', () => {
    const { file } = readUrlOptions('?file=%2Ftmp%2Fmy%20roadmap.yaml');

    expect(file).toBe('/tmp/my roadmap.yaml');
  });

  test('treats a missing or empty file param as no file', () => {
    expect(readUrlOptions('').file).toBeNull();
    expect(readUrlOptions('?file=').file).toBeNull();
  });

  test('hides the assignee filter only for assigneeFilter=off', () => {
    expect(readUrlOptions('?file=/x.yaml&assigneeFilter=off').hideAssigneeFilter).toBe(true);
    expect(readUrlOptions('?file=/x.yaml').hideAssigneeFilter).toBe(false);
  });

  // A truthiness check instead of an equality check would hide the filter here,
  // which is the opposite of what the parameter says.
  test('keeps the assignee filter for any other assigneeFilter value', () => {
    expect(readUrlOptions('?assigneeFilter=on').hideAssigneeFilter).toBe(false);
    expect(readUrlOptions('?assigneeFilter').hideAssigneeFilter).toBe(false);
  });

  test('hides empty projects only for emptyProjects=off', () => {
    expect(readUrlOptions('?file=/x.yaml&emptyProjects=off').hideEmptyProjects).toBe(true);
    expect(readUrlOptions('?file=/x.yaml').hideEmptyProjects).toBe(false);
  });

  // Showing empty projects is the default, so a page opened bare at localhost/
  // with no query string at all must land on showing them.
  test('shows empty projects for any other emptyProjects value', () => {
    expect(readUrlOptions('').hideEmptyProjects).toBe(false);
    expect(readUrlOptions('?emptyProjects=on').hideEmptyProjects).toBe(false);
    expect(readUrlOptions('?emptyProjects').hideEmptyProjects).toBe(false);
  });
});
