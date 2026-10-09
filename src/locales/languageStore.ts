export type Locale = 'ko' | 'ja';
export type LanguagePreference = 'system' | Locale;
export type LanguageState = {
  languagePreference: LanguagePreference;
  resolvedLanguage: Locale;
  isHydrated: boolean;
  storageError: 'read' | 'write' | null;
};

export const LANGUAGE_STORAGE_KEY = 'poparchive.languagePreference';
export const LANGUAGE_RESTORE_TIMEOUT_MS = 2000;

export function parseLanguagePreference(value: unknown): LanguagePreference {
  return value === 'ko' || value === 'ja' ? value : 'system';
}

// Use the first supported language in the OS preference order.
export function resolveSystemLanguage(languageTags: readonly string[]): Locale {
  for (const tag of languageTags) {
    const code = tag.toLowerCase().split(/[-_]/)[0];
    if (code === 'ko' || code === 'ja') return code;
  }
  return 'ko';
}

type LanguageEnvironment = {
  read: () => Promise<string | null>;
  write: (value: LanguagePreference) => Promise<void>;
  getLanguageTags: () => readonly string[];
};

export function createLanguageStore() {
  let state: LanguageState = {
    languagePreference: 'system', resolvedLanguage: 'ko', isHydrated: false, storageError: null,
  };
  const listeners = new Set<() => void>();
  let environment: LanguageEnvironment | undefined;
  let initialization: Promise<void> | undefined;
  let revision = 0;
  let writes: Promise<void> = Promise.resolve();

  function publish(next: LanguageState) {
    if (Object.keys(next).every(key => next[key as keyof LanguageState] === state[key as keyof LanguageState])) return;
    state = next;
    listeners.forEach(listener => listener());
  }

  function systemLanguage(): Locale {
    try { return resolveSystemLanguage(environment?.getLanguageTags() ?? []); }
    catch { return 'ko'; }
  }

  function resolved(preference: LanguagePreference): Locale {
    return preference === 'system' ? systemLanguage() : preference;
  }

  function initialize(nextEnvironment: LanguageEnvironment): Promise<void> {
    if (initialization) return initialization;
    environment = nextEnvironment;
    const startingRevision = revision;
    initialization = (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let preference: LanguagePreference = 'system';
      let storageError: LanguageState['storageError'] = null;
      try {
        const value = await Promise.race([
          environment.read(),
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => reject(new Error('Language restore timed out')), LANGUAGE_RESTORE_TIMEOUT_MS);
          }),
        ]);
        preference = parseLanguagePreference(value);
      } catch { storageError = 'read'; }
      finally { clearTimeout(timer); }
      // A late read must never override a selection made during initialization.
      if (revision !== startingRevision) preference = state.languagePreference;
      publish({ ...state, languagePreference: preference, resolvedLanguage: resolved(preference),
        isHydrated: true, storageError: revision === startingRevision ? storageError : state.storageError });
    })();
    return initialization;
  }

  function setLanguagePreference(value: LanguagePreference): Promise<void> {
    const preference = parseLanguagePreference(value);
    const selectionRevision = ++revision;
    publish({ ...state, languagePreference: preference, resolvedLanguage: resolved(preference), storageError: null });
    // Serial writes prevent a slower older write from overwriting the latest selection.
    writes = writes.then(async () => {
      try {
        if (!environment) throw new Error('Language store is not initialized');
        await environment.write(preference);
      } catch {
        if (selectionRevision === revision) publish({ ...state, storageError: 'write' });
      }
    });
    return writes;
  }

  function refreshSystemLanguage() {
    if (state.languagePreference === 'system') publish({ ...state, resolvedLanguage: systemLanguage() });
  }

  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    initialize, setLanguagePreference, refreshSystemLanguage,
  };
}

export const languageStore = createLanguageStore();
