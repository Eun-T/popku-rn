const { readFileSync } = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const cache = new Map();
const pureFiles = new Set([
  'src/theme/tokens.ts', 'src/theme/communityColors.ts', 'src/theme/themeColors.ts', 'src/theme/themeFeature.js',
  'src/lib/communityTime.ts', 'src/locales/index.ts', 'src/locales/languageStore.ts',
  'src/lib/loginReturn.ts', 'src/lib/requestTimeout.ts',
  'src/lib/mapDirections.ts',
  'src/lib/placeDatePeriod.ts',
  'src/locales/filterLabels.ts', 'src/locales/accountUi.ts',
]);

function loadPure(file) {
  if (cache.has(file)) return cache.get(file);
  if (!pureFiles.has(file)) throw new Error(`Not a pure UI dependency: ${file}`);
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    const resolved = path.resolve(root, path.dirname(file), name);
    if (resolved.endsWith('.json')) return JSON.parse(readFileSync(resolved, 'utf8'));
    const relative = path.relative(root, resolved).replaceAll('\\', '/');
    return loadPure(relative === 'src/locales' ? `${relative}/index.ts` : `${relative}.ts`);
  }, module, module.exports);
  cache.set(file, module.exports);
  return module.exports;
}

// Use production design constants, not empty/partial token mocks. Other imports stay strict.
function withUiDependencies(file, mocks = {}, requestFetch) {
  mocks = withI18nDependencies(file, mocks, requestFetch);
  const imports = {};
  if (file === 'src/lib/auth.ts') imports['./deviceId'] = { getDeviceId: async () => 'device' };
  // Legacy isolated form tests use settled authentication fixtures. Account-race
  // tests in uploadTimeout execute the real auth and submissionSession modules.
  let submissionKey = path.relative(path.dirname(file), 'src/lib/submissionSession').replaceAll('\\', '/');
  if (!submissionKey.startsWith('.')) submissionKey = `./${submissionKey}`;
  imports[submissionKey] = {
    captureSubmissionOwner: () => ({ generation: 0, email: 'fixture@example.test' }),
    assertSubmissionOwner() {}, assertAttemptOwner() {}, isSubmissionOwnerCurrent: () => true,
    watchSubmissionSession: () => () => {}, isSubmissionAuthCleared: () => true,
  };
  // Existing isolated tests do not model moderation; dedicated moderation tests
  // execute the real API/store and mounted action components.
  for (const [dependency, value] of Object.entries({
    'src/hooks/useModerationRevision': { useModerationRevision: () => 0 },
    'src/lib/moderationState': { isLocallyBlocked: () => false, captureModerationRead: () => ({}), assertModerationRead() {} },
    'src/components/community/ModerationActions': { __esModule: true, default: 'ModerationActions' },
    'src/components/community/PostActions': { __esModule: true, default: 'PostActions' },
  })) {
    let key = path.relative(path.dirname(file), dependency).replaceAll('\\', '/');
    if (!key.startsWith('.')) key = `./${key}`;
    imports[key] = value;
  }
  if (file === 'src/app/(tabs)/profile/login.tsx') {
    const headerFile = 'src/components/profile/NoticeLayout.tsx';
    const module = { exports: {} };
    const dependencies = withUiDependencies(headerFile, {
      'react-native': { StyleSheet: { create: value => value } },
      'expo-router': {}, 'lucide-react-native': {}, 'react-native-safe-area-context': {},
    });
    const code = ts.transpileModule(readFileSync(path.join(root, headerFile), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    new Function('require', 'module', 'exports', code)(name => name === 'react/jsx-runtime' ? {} : dependencies[name], module, module.exports);
    imports['../../../components/profile/NoticeLayout'] = module.exports;
  }
  let actionsKey = path.relative(path.resolve(root, path.dirname(file)), path.resolve(root, 'src/components/reviews/ReviewActions'))
    .replaceAll('\\', '/');
  if (!actionsKey.startsWith('.')) actionsKey = `./${actionsKey}`;
  // Parent screen tests inspect the child props; action behavior is covered with
  // the actual component in reviewMenus.test.cjs.
  imports[actionsKey] = { __esModule: true, default: 'ReviewActions' };
  const keys = {};
  for (const dependency of ['src/theme/tokens.ts', 'src/theme/communityColors.ts', 'src/lib/communityTime.ts', 'src/lib/loginReturn.ts', 'src/lib/requestTimeout.ts']) {
    let key = path.relative(path.resolve(root, path.dirname(file)), path.resolve(root, dependency))
      .replaceAll('\\', '/').replace(/\.ts$/, '');
    if (!key.startsWith('.')) key = `./${key}`;
    keys[dependency] = key;
    imports[key] = loadPure(dependency);
  }
  return { ...imports, ...mocks,
    [keys['src/theme/tokens.ts']]: loadPure('src/theme/tokens.ts'),
    [keys['src/theme/communityColors.ts']]: loadPure('src/theme/communityColors.ts'),
  };
}

// Existing isolated UI tests supply their own translations. Production subscriptions
// and persistence are exercised with the real modules in i18n.test.cjs.
function withI18nDependencies(file, mocks = {}, requestFetch) {
  const imports = { ...mocks };
  if (file === 'src/lib/auth.ts') imports['./deviceId'] ??= { getDeviceId: async () => 'device' };
  if (file.startsWith('src/lib/') && file !== 'src/lib/auth.ts' && file !== 'src/lib/deviceId.ts') {
    imports['./auth'] = require('./authRequestMock.cjs').authRequestMock(imports['./auth'] ?? {}, requestFetch);
  }
  for (const [name, value] of Object.entries(imports)) {
    if (/\/auth(?:\.ts)?$/.test(name) && value && typeof value === 'object') {
      imports[name] = { ...require('./authRequestMock.cjs').authRequestMock(value, requestFetch),
        getDeviceId: value.getDeviceId ?? (async () => value.DEVICE_ID ?? 'device'),
        authSessionRevision: value.authSessionRevision ?? value.authSessionGeneration ?? (() => 0) };
    }
  }
  // Stateless card fixtures inspect their parent UI. The mounted recovery and
  // both carousel layers run with real modules in exploreCoverRecovery.test.cjs.
  if (['src/components/place/PlaceWeeklyPopupList.tsx','src/components/place/TodayOpeningCarousel.tsx'].includes(file)) {
    imports['./ExplorePopupPoster'] ??= { __esModule: true, default: 'ExplorePopupPoster' };
  }
  if (['src/screens/PlaceScreen.tsx','src/components/place/PlaceWeeklySection.tsx','src/app/places/[id].tsx'].includes(file)) {
    const key = file.includes('/screens/') ? '../lib/exploreCoverRecovery' : '../../lib/exploreCoverRecovery';
    imports[key] ??= { recoverExploreCover: async () => null,
      mergeExploreCovers: (rows, _country, _language, fetchedAt) => rows.map(row => ({ ...row, coverImageFetchedAt: fetchedAt })) };
  }
  if (file === 'src/app/places/[id].tsx') imports['../../lib/placeCoverRecovery'] ??= { mergeRecoveredCover: rows => rows };
  if (['src/components/home/NewPopupCard.tsx', 'src/components/home/PopupRankingCard.tsx'].includes(file)) {
    imports['expo-image'] ??= { Image: imports['react-native']?.Image ?? 'ExpoImage' };
    // Stateless layout fixtures; homeCoverRecovery executes the real mounted hook/API.
    imports['../../hooks/useHomeCoverImage'] ??= { useHomeCoverImage: image => ({
      source: image, imageKey: 'fixture', canRetry: false, busy: false, onError() {}, onLoad() {},
    }) };
  }
  // Legacy isolated UI fixtures already represent a settled session. Restoration
  // tests supply the real auth module or explicit status/subscription mocks.
  for (const [key, auth] of Object.entries(imports)) {
    if (!key.endsWith('/lib/auth') || !auth.getAuthUser) continue;
    imports[key] = { ...auth,
      getAuthStatus: auth.getAuthStatus ?? (() => auth.getAuthUser() ? 'authenticated' : 'anonymous'),
      subscribeAuthStatus: auth.subscribeAuthStatus ?? auth.subscribeAuthUser,
    };
  }
  let dateKey = path.relative(path.dirname(file), 'src/lib/placeDatePeriod').replaceAll('\\', '/');
  if (!dateKey.startsWith('.')) dateKey = `./${dateKey}`;
  imports[dateKey] ??= loadPure('src/lib/placeDatePeriod.ts');
  if (file === 'src/components/place/PlaceFilterSheet.tsx') {
    imports['./PlacePeriodPicker'] ??= { default: 'PlacePeriodPicker' };
  }
  if (file === 'src/app/(tabs)/profile/login.tsx' || file === 'src/app/(tabs)/profile/signup.tsx') {
    imports['expo-image'] ??= { Image: 'ExpoImage' };
    imports['expo-font'] ??= { useFonts: () => [true] };
    imports['expo-apple-authentication'] ??= {};
    imports['../../../lib/appleAuth'] ??= { isAppleAuthenticationAvailable: async () => false,
      getAppleSignupToken: () => null, clearAppleSignup() {} };
  }
  if (file === 'src/app/places/[id].tsx') {
    imports['expo-constants'] ??= { default: { expoConfig: { ios: { bundleIdentifier: 'com.popku.app' }, android: { package: 'com.popku.app' } } } };
    imports['../../components/place/DirectionsSheet'] ??= { default: 'DirectionsSheet' };
    imports['../../lib/mapDirections'] ??= loadPure('src/lib/mapDirections.ts');
  }
  let featureKey = path.relative(path.dirname(file), 'src/theme/themeFeature.js').replaceAll('\\', '/');
  if (!featureKey.startsWith('.')) featureKey = `./${featureKey}`;
  imports[featureKey] ??= loadPure('src/theme/themeFeature.js');
  let themeKey = path.relative(path.dirname(file), 'src/theme/useTheme').replaceAll('\\', '/');
  if (!themeKey.startsWith('.')) themeKey = `./${themeKey}`;
  imports[themeKey] ??= { useTheme: () => ({ resolvedTheme: 'light',
    themeColors: loadPure('src/theme/themeColors.ts').lightThemeColors }) };
  imports.react ??= {};
  imports.react.useMemo ??= fn => fn();
  let hookKey = path.relative(path.dirname(file), 'src/hooks/useTranslation').replaceAll('\\', '/');
  if (!hookKey.startsWith('.')) hookKey = `./${hookKey}`;
  let localeKey = path.relative(path.dirname(file), 'src/locales').replaceAll('\\', '/');
  if (!localeKey.startsWith('.')) localeKey = `./${localeKey}`;
  const locale = imports[localeKey] ?? loadPure('src/locales/index.ts');
  imports[localeKey] = { ...locale,
    getApiLocale: locale.getApiLocale ?? locale.getLocale,
    translate: locale.translate ?? ((_language, key, params) => locale.t(key, params)),
  };
  imports[`${localeKey}/languageStore`] ??= loadPure('src/locales/languageStore.ts');
  imports[hookKey] ??= { useTranslation: () => ({ languagePreference: 'system',
    resolvedLanguage: locale.getLocale?.() ?? 'ko', isHydrated: true, storageError: null, t: locale.t }) };
  let labelsKey = path.relative(path.dirname(file), 'src/locales/filterLabels').replaceAll('\\', '/');
  if (!labelsKey.startsWith('.')) labelsKey = `./${labelsKey}`;
  imports[labelsKey] ??= loadPure('src/locales/filterLabels.ts');
  let accountKey = path.relative(path.dirname(file), 'src/locales/accountUi').replaceAll('\\', '/');
  if (!accountKey.startsWith('.')) accountKey = `./${accountKey}`;
  imports[accountKey] ??= loadPure('src/locales/accountUi.ts');
  return imports;
}

module.exports = { withUiDependencies, withI18nDependencies, loadPure };
