import { afterEach } from 'vitest';

// Keep tests isolated: persisted state must never leak between test files.
afterEach(() => {
  window.localStorage.clear();
});
