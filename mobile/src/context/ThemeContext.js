import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SystemUI from 'expo-system-ui';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Appearance, Platform, useColorScheme } from 'react-native';
import { createThemedStyles, getThemeColors, setColorScheme } from '../theme/theme';

const THEME_STORAGE_KEY = 'mega-music-theme-mode';
const modes = new Set(['system', 'light', 'dark']);
const ThemeContext = createContext({
  mode: 'system',
  scheme: 'dark',
  palette: getThemeColors('dark'),
  setMode: async () => {}
});

export function ThemeProvider({ children }) {
  const deviceScheme = useColorScheme() || 'dark';
  const [mode, setModeState] = useState('system');
  const modeChanged = useRef(false);
  const scheme = mode === 'system' ? deviceScheme : mode;
  const palette = getThemeColors(scheme);

  setColorScheme(scheme);

  useEffect(() => {
    let mounted = true;

    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((savedMode) => {
        if (mounted && !modeChanged.current && modes.has(savedMode)) {
          setModeState(savedMode);
        }
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(palette.bg).catch(() => {});

    if (Platform.OS !== 'web') {
      Appearance.setColorScheme(mode === 'system' ? 'auto' : mode);
    }
  }, [mode, palette, scheme]);

  const setMode = async (nextMode) => {
    if (!modes.has(nextMode)) {
      return;
    }

    modeChanged.current = true;
    setModeState(nextMode);

    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, nextMode);
    } catch {
      // Keep the selected theme active for this session if storage is unavailable.
    }
  };

  return (
    <ThemeContext.Provider value={{ mode, scheme, palette, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function useThemeStyles(styleDefinitions) {
  const { scheme } = useContext(ThemeContext);
  return createThemedStyles(styleDefinitions, scheme);
}