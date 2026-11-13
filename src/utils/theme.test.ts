/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from 'vitest';
import { applyTheme, THEME_STORAGE_KEY } from './theme';

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe('applyTheme', () => {
  it('applies dark mode and mirrors it for the boot screen', () => {
    applyTheme('dark');

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('applies light mode and updates the mirror', () => {
    applyTheme('dark');
    applyTheme('light');

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });
});
