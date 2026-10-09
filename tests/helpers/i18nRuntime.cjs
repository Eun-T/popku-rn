const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const jsx = (type, props, key) => ({ type, props, key });
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes)
  : [tree, ...nodes(tree.props?.children), ...nodes(tree.props?.ListHeaderComponent), ...nodes(tree.props?.ListFooterComponent), ...nodes(tree.props?.ListEmptyComponent)];
const texts = tree => nodes(tree).filter(n => n.type === 'Text').map(n => n.props.children).flat().join('|');
const flush = () => new Promise(resolve => setImmediate(resolve));
class Clock extends Date {
  constructor(...args) { super(...(args.length ? args : [2026, 9, 9, 12])); }
  static now() { return new Clock().getTime(); }
}

// Real TS components, locale/store/subscription and data logic. Native layout and
// navigation libraries are mocked; this is not a native rendering/device test.
function runtime(overrides = {}, options = {}) {
  let owner, cursor;
  const owners = [], cache = new Map();
  const same = (a,b) => a && b && a.length === b.length && a.every((v,i) => Object.is(v,b[i]));
  const react = {
    useState(initial) {
      const current = owner, i = cursor++;
      current.slots[i] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [current.slots[i].value, next => {
        const value = typeof next === 'function' ? next(current.slots[i].value) : next;
        if (!Object.is(value,current.slots[i].value)) {
          current.slots[i].value = value; current.dirty = true;
          if (!current.rendering) current.render();
        }
      }];
    },
    useRef(value) { return owner.slots[cursor++] ??= { current: value }; },
    useMemo(fn,deps) { const i=cursor++; if (!same(owner.slots[i]?.deps,deps)) owner.slots[i]={ deps, value:fn() }; return owner.slots[i].value; },
    useCallback(fn,deps) { return react.useMemo(() => fn,deps); },
    useId() { return react.useMemo(() => 'id',[]); },
    useEffect(fn,deps) {
      const current=owner, i=cursor++, previous=current.slots[i];
      if (!same(previous?.deps,deps)) {
        current.slots[i]={ deps }; current.effects.push(() => {
          previous?.cleanup?.(); current.slots[i].cleanup = fn();
        });
      }
    },
    useSyncExternalStore(subscribe,snapshot) {
      const current=owner, i=cursor++;
      if (current.slots[i]?.subscribe !== subscribe) {
        current.slots[i]?.cleanup?.();
        current.slots[i] = { subscribe,cleanup:subscribe(() => current.render()) };
      }
      return snapshot();
    },
  };
  function mount(fn) {
    const current={ slots:[], effects:[], render() {
      if (current.rendering) { current.dirty=true; return; }
      const previous=owner, previousCursor=cursor; current.rendering=true;
      let limit=0;
      do {
        assert.ok(limit++<40,'render loop'); owner=current; cursor=0; current.dirty=false;
        current.tree=fn(); current.effects.splice(0).forEach(effect => effect());
      } while (current.dirty);
      current.rendering=false; owner=previous; cursor=previousCursor;
    } };
    owners.push(current); current.render(); return current;
  }
  function load(file) {
    if (file in overrides) return overrides[file];
    if (cache.has(file)) return cache.get(file);
    if (/\.(png|webp)$/.test(file)) return file;
    if (file.endsWith('.json')) return JSON.parse(fs.readFileSync(file,'utf8'));
    const module={ exports:{} };
    const original=fs.readFileSync(file,'utf8');
    const source=options.transform ? options.transform(file,original) : original;
    const code=ts.transpileModule(source,{ compilerOptions:{ module:ts.ModuleKind.CommonJS,
      target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true } }).outputText;
    new Function('require','module','exports','Date','__DEV__','setInterval','clearInterval','fetch','setTimeout','clearTimeout',code)(name => {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx,jsxs:jsx };
      if (name === 'react/compiler-runtime') return { c: size => react.useMemo(() => Array(size).fill(Symbol.for('react.memo_cache_sentinel')),[]) };
      if (name in overrides) return overrides[name];
      assert.ok(name.startsWith('.'),`Missing dependency ${name}`);
      let relative=path.posix.normalize(path.posix.join(path.posix.dirname(file),name));
      if (!path.posix.extname(relative)) relative += fs.existsSync(`${relative}.ts`) ? '.ts' : fs.existsSync(`${relative}.tsx`) ? '.tsx' : '/index.ts';
      return load(relative);
    },module,module.exports,Clock,false,() => 1,() => {},overrides.fetch ?? global.fetch,
      overrides.setTimeout ?? setTimeout,overrides.clearTimeout ?? clearTimeout);
    cache.set(file,module.exports); return module.exports;
  }
  return { react,load,mount,renderAll() { owners.forEach(o => o.render()); },dispose() { owners.forEach(o => o.slots.forEach(s => s?.cleanup?.())); } };
}
module.exports={ runtime,nodes,texts,jsx,flush };
