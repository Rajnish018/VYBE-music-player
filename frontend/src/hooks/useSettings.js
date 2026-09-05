import { useCallback, useEffect, useState } from 'react';

export const VOLUME_STORAGE_KEY = 'aura-volume';
export const THEME_STORAGE_KEY = 'aura-theme';

const DEFAULT_VOLUME = 0.7;
const DEFAULT_THEME = 'system';
const THEMES = new Set(['system', 'dark', 'light']);

function clampVolume(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return DEFAULT_VOLUME;
  }

  return Math.min(1, Math.max(0, numericValue));
}

function readStoredVolume() {
  try {
    const storedValue = window.localStorage.getItem(VOLUME_STORAGE_KEY);

    if (storedValue === null) {
      return DEFAULT_VOLUME;
    }

    return clampVolume(storedValue);
  } catch {
    return DEFAULT_VOLUME;
  }
}

function readStoredTheme() {
  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return THEMES.has(storedTheme) ? storedTheme : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function useSettings() {
  const [volume, setVolumeState] = useState(readStoredVolume);
  const [theme, setThemeState] = useState(readStoredTheme);

  const setVolume = useCallback((nextVolume) => {
    setVolumeState(() => {
      const clampedVolume = clampVolume(nextVolume);

      try {
        window.localStorage.setItem(
          VOLUME_STORAGE_KEY,
          String(clampedVolume),
        );
      } catch {
        // localStorage may be unavailable in private or restricted contexts.
      }

      return clampedVolume;
    });
  }, []);

  const setTheme = useCallback((nextTheme) => {
    const safeTheme = THEMES.has(nextTheme) ? nextTheme : DEFAULT_THEME;

    setThemeState(safeTheme);

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, safeTheme);
    } catch {
      // localStorage may be unavailable in private or restricted contexts.
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return {
    volume,
    setVolume,
    theme,
    setTheme,
  };
}
