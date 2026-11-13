import type { ThemeMode } from '../domain/types';

export const THEME_STORAGE_KEY = 'calculadora-p2p-theme';

export function applyTheme(theme: ThemeMode): void {
  document.documentElement.dataset.theme = theme;

  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The attribute still applies when storage is unavailable.
  }
}
