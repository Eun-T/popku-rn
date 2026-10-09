import { useMemo, useSyncExternalStore } from 'react';

import { translate } from '../locales';
import { languageStore } from '../locales/languageStore';

// Each consumer subscribes, including memo components and retained tab screens.
export function useTranslation() {
  const state = useSyncExternalStore(languageStore.subscribe, languageStore.getSnapshot, languageStore.getSnapshot);
  const { resolvedLanguage } = state;
  // Make the language a visible dependency for React Compiler and memo consumers.
  const t = useMemo(() => (key: string, params?: Record<string, string | number>) =>
    translate(resolvedLanguage, key, params), [resolvedLanguage]);
  return { ...state, t };
}
