import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { LANGUAGE_STORAGE_KEY, parseLanguagePreference, type LanguagePreference } from './languageStore';

let selectionRevision = 0;
let mutations: Promise<void> = Promise.resolve();

function enqueue(operation: () => Promise<void>): Promise<void> {
  const result = mutations.then(operation);
  // A failed migration or write must not prevent a later selection from saving.
  mutations = result.catch(() => {});
  return result;
}

async function cleanLegacyPreference(): Promise<void> {
  try { await SecureStore.deleteItemAsync(LANGUAGE_STORAGE_KEY); }
  catch { /* Keep the AsyncStorage value; retry legacy cleanup on the next launch. */ }
}

export async function readLanguagePreference(): Promise<string | null> {
  const startingRevision = selectionRevision;
  const current = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (current !== null) {
    // AsyncStorage is authoritative, including values rejected by the store validator.
    void cleanLegacyPreference();
    return current;
  }

  const legacy = await SecureStore.getItemAsync(LANGUAGE_STORAGE_KEY);
  if (legacy === null) return null;
  const preference = parseLanguagePreference(legacy);
  await enqueue(async () => {
    // A restore that finishes after the UI timeout must not overwrite a new choice.
    if (selectionRevision !== startingRevision) return;
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, preference);
    // Delete only after the destination write succeeds. Cleanup never blocks hydration.
    void cleanLegacyPreference();
  });
  return preference;
}

export function writeLanguagePreference(preference: LanguagePreference): Promise<void> {
  selectionRevision++;
  return enqueue(async () => {
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, preference);
    void cleanLegacyPreference();
  });
}
