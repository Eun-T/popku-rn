import AsyncStorage from '@react-native-async-storage/async-storage';

import { THEME_STORAGE_KEY, type ThemePreference } from './themeStore';

export function readThemePreference(): Promise<string | null> {
  return AsyncStorage.getItem(THEME_STORAGE_KEY);
}

export function writeThemePreference(preference: ThemePreference): Promise<void> {
  return AsyncStorage.setItem(THEME_STORAGE_KEY, preference);
}
