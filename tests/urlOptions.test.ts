import { describe, test, expect } from 'vitest';
import { readUrlOptions } from '../src/urlOptions';

// The CLI hands its flags to the client through the query string (bin/cli.ts),
// so this parser is one half of a contract with no other guard on it. The
// literals below are the URLs the CLI actually emits.
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
});

describe('App module', () => {
  // Regression: App.tsx read window.location.search at module scope, so merely
  // importing it threw ReferenceError anywhere outside a browser — which blocks
  // any component test before it can render a thing.
  test('imports outside a browser, reading the URL only on render', async () => {
    await expect(import('../src/App')).resolves.toBeDefined();
  });
});
