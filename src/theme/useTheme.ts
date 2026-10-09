import { useSyncExternalStore } from 'react';

import { darkThemeColors, lightThemeColors, type ThemeColors } from './themeColors';
import { themeStore } from './themeStore';

// Every consumer subscribes directly, including memoized/Compiler-cached screens.
export function useTheme() {
  const state = useSyncExternalStore(themeStore.subscribe, themeStore.getSnapshot, themeStore.getSnapshot);
  const themeColors: ThemeColors = state.resolvedTheme === 'dark' ? darkThemeColors : lightThemeColors;
  return { ...state, setThemePreference: themeStore.setThemePreference, themeColors };
}
