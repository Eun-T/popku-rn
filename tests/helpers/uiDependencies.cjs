const { readFileSync } = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const cache = new Map();
const pureFiles = new Set([
  'src/theme/tokens.ts', 'src/theme/communityColors.ts', 'src/theme/themeColors.ts', 'src/theme/themeFeature.js',
  'src/lib/communityTime.ts', 'src/locales/index.ts', 'src/locales/languageStore.ts',
  'src/lib/loginReturn.ts',
  'src/lib/mapDirections.ts',
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
function withUiDependencies(file, mocks = {}) {
  mocks = withI18nDependencies(file, mocks);
  const imports = {};
  let actionsKey = path.relative(path.resolve(root, path.dirname(file)), path.resolve(root, 'src/components/reviews/ReviewActions'))
    .replaceAll('\\', '/');
  if (!actionsKey.startsWith('.')) actionsKey = `./${actionsKey}`;
  // Parent screen tests inspect the child props; action behavior is covered with
  // the actual component in reviewMenus.test.cjs.
  imports[actionsKey] = { __esModule: true, default: 'ReviewActions' };
  const keys = {};
  for (const dependency of ['src/theme/tokens.ts', 'src/theme/communityColors.ts', 'src/lib/communityTime.ts', 'src/lib/loginReturn.ts']) {
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
function withI18nDependencies(file, mocks = {}) {
  const imports = { ...mocks };
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
