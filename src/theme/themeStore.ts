import { DARK_MODE_ENABLED } from './themeFeature.js';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';
export type ThemeState = Readonly<{
  themePreference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  isHydrated: boolean;
  storageError: 'read' | 'write' | null;
}>;

export const THEME_STORAGE_KEY = 'poparchive.themePreference';
export const THEME_RESTORE_TIMEOUT_MS = 2000;

export function parseThemePreference(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system';
}

type ThemeEnvironment = {
  read: () => Promise<string | null>;
  write: (value: ThemePreference) => Promise<void>;
  getColorScheme: () => string | null | undefined;
};

// Immutable snapshots and explicit subscriptions, matching the language store pattern.
export function createThemeStore() {
  let state: ThemeState = Object.freeze({
    themePreference: 'system', resolvedTheme: 'light', isHydrated: false, storageError: null,
  });
  const listeners = new Set<() => void>();
  let environment: ThemeEnvironment | undefined;
  let initialization: Promise<void> | undefined;
  let revision = 0;
  let writes: Promise<void> = Promise.resolve();

  function publish(next: ThemeState) {
    if (Object.keys(next).every(key => next[key as keyof ThemeState] === state[key as keyof ThemeState])) return;
    state = Object.freeze(next);
    listeners.forEach(listener => listener());
  }

  function resolved(preference: ThemePreference): ResolvedTheme {
    if (!DARK_MODE_ENABLED) return 'light';
    if (preference !== 'system') return preference;
    try { return environment?.getColorScheme() === 'dark' ? 'dark' : 'light'; }
    catch { return 'light'; }
  }

  function initialize(nextEnvironment: ThemeEnvironment): Promise<void> {
    if (initialization) return initialization;
    environment = nextEnvironment;
    const startingRevision = revision;
    publish({ ...state, resolvedTheme: resolved(state.themePreference) });
    initialization = (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let preference: ThemePreference = 'system';
      let storageError: ThemeState['storageError'] = null;
      try {
        const value = await Promise.race([
          nextEnvironment.read(),
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => reject(new Error('Theme restore timed out')), THEME_RESTORE_TIMEOUT_MS);
          }),
        ]);
        preference = parseThemePreference(value);
      } catch { storageError = 'read'; }
      finally { clearTimeout(timer); }
      // Late restoration cannot overwrite a newer user choice.
      if (revision !== startingRevision) preference = state.themePreference;
      publish({ ...state, themePreference: preference, resolvedTheme: resolved(preference),
        isHydrated: true, storageError: revision === startingRevision ? storageError : state.storageError });
    })();
    return initialization;
  }

  function setThemePreference(value: ThemePreference): Promise<void> {
    const preference = parseThemePreference(value);
    const selectionRevision = ++revision;
    publish({ ...state, themePreference: preference, resolvedTheme: resolved(preference), storageError: null });
    // Serialize writes so rapid selections persist in order. Failures do not block later writes.
    writes = writes.then(async () => {
      try {
        if (!environment) throw new Error('Theme store is not initialized');
        await environment.write(preference);
      } catch {
        if (selectionRevision === revision) publish({ ...state, themePreference: 'system',
          resolvedTheme: resolved('system'), storageError: 'write' });
      }
    });
    return writes;
  }

  function refreshSystemTheme() {
    if (state.themePreference === 'system') publish({ ...state, resolvedTheme: resolved('system') });
  }

  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    initialize, setThemePreference, refreshSystemTheme,
  };
}

export const themeStore = createThemeStore();
