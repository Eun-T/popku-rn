import { getLocales } from 'expo-localization';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, type ReactNode } from 'react';
import { AppState, StyleSheet, View } from 'react-native';

import { useTranslation } from '../hooks/useTranslation';
import { languageStore } from './languageStore';
import { readLanguagePreference, writeLanguagePreference } from './languageStorage';

// Retain the existing native splash until the language used for the first UI is known.
void SplashScreen.preventAutoHideAsync().catch(() => {});

export default function LanguageProvider({ children }: { children: ReactNode }) {
  const { isHydrated } = useTranslation();

  useEffect(() => {
    void languageStore.initialize({
      read: readLanguagePreference,
      write: writeLanguagePreference,
      getLanguageTags: () => getLocales().map(locale => locale.languageTag),
    });
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') languageStore.refreshSystemLanguage();
    });
    return () => subscription.remove();
  }, []);

  if (!isHydrated) return null;
  return (
    <View style={styles.container} onLayout={() => { void SplashScreen.hideAsync().catch(() => {}); }}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1 } });
