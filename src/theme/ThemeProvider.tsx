import { useEffect, type ReactNode } from 'react';
import { Appearance, AppState, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { DARK_MODE_ENABLED } from './themeFeature.js';

import { readThemePreference, writeThemePreference } from './themeStorage';
import { themeStore } from './themeStore';
import { useTheme } from './useTheme';

export default function ThemeProvider({ children }: { children: ReactNode }) {
  const { isHydrated } = useTheme();

  useEffect(() => {
    // Native widgets and Router's OS appearance observe the same temporary override.
    // React Native Web exposes Appearance observers, but not this native override.
    if (Platform.OS !== 'web' && typeof Appearance.setColorScheme === 'function') {
      Appearance.setColorScheme(DARK_MODE_ENABLED ? 'unspecified' : 'light');
    }
    void themeStore.initialize({
      read: readThemePreference,
      write: writeThemePreference,
      getColorScheme: () => Appearance.getColorScheme(),
    });
    const appearance = Appearance.addChangeListener(() => themeStore.refreshSystemTheme());
    const appState = AppState.addEventListener('change', state => {
      if (state === 'active') themeStore.refreshSystemTheme();
    });
    return () => { appearance.remove(); appState.remove(); };
  }, []);

  // Root nests LanguageProvider here; its existing splash/layout lifecycle waits for both.
  // After startup, never gate/remount children on preference or OS changes.
  if (!isHydrated) return null;
  return DARK_MODE_ENABLED ? children : <><StatusBar style="dark" />{children}</>;
}
