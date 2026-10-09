const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

function bundledModule(file, mocks) {
  const module = { exports: {} };
  new Function('require', 'module', 'exports', readFileSync(require.resolve(file), 'utf8'))(name => {
    assert.ok(name in mocks, `Missing navigation dependency: ${name}`);
    return mocks[name];
  }, module, module.exports);
  return module.exports;
}

// Run the installed hook and action replay logic; mock only their React/context boundaries.
function preventRemoveHook(react, navigation, setPreventRemove = () => {}) {
  const useLatestCallback = bundledModule('expo-router/build/utils/useLatestCallback.js', { react }).default;
  return bundledModule('expo-router/build/react-navigation/core/usePreventRemove.js', {
    react, 'nanoid/non-secure': { nanoid: () => 'guard' },
    '../../utils/useLatestCallback': useLatestCallback,
    './useNavigation': { useNavigation: () => navigation },
    './useRoute': { useRoute: () => ({ key: 'write' }) },
    './usePreventRemoveContext': { usePreventRemoveContext: () => ({ setPreventRemove }) },
  }).usePreventRemove;
}

function removalDriver(react) {
  const listeners = new Set(), completed = [], nativeFlags = [];
  const { shouldPreventRemove } = bundledModule('expo-router/build/react-navigation/core/useOnPreventRemove.js', {
    react, './NavigationBuilderContext': {}, './NavigationProvider': {},
  });
  const emitter = { emit(event) {
    event.defaultPrevented = false;
    event.preventDefault = () => { event.defaultPrevented = true; };
    listeners.forEach(fn => fn(event));
    return event;
  } };
  const navigation = {
    getState: () => ({ index: 0, routes: [{ key: 'write', name: 'reviews/write' }] }),
    addListener(name, fn) { assert.equal(name, 'beforeRemove'); listeners.add(fn); return () => listeners.delete(fn); },
    dispatch(action) {
      const blocked = shouldPreventRemove(emitter, {}, [{ key: 'write' }], [], action);
      if (!blocked) completed.push(action);
      return blocked;
    },
  };
  const setPreventRemove = (_id, _key, enabled) => nativeFlags.push(enabled);
  return { navigation, completed, nativeFlags, request: navigation.dispatch,
    usePreventRemove: preventRemoveHook(react, navigation, setPreventRemove),
    get listenerCount() { return listeners.size; } };
}

module.exports = { preventRemoveHook, removalDriver };
