import { describe, test, expect } from 'vitest';

describe('App module', () => {
  // Regression: App.tsx read window.location.search at module scope, so merely
  // importing it threw ReferenceError anywhere outside a browser — which blocks
  // any component test before it can render a thing.
  test('imports outside a browser, reading the URL only on render', async () => {
    await expect(import('../src/App')).resolves.toBeDefined();
  });
});
