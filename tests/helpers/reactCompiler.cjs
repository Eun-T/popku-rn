const assert = require('node:assert/strict');
const babel = require('@babel/core');

// Matches the project's React 19 compiler target; no source hot-reload reset.
function compilerTransform(files, { allowBailout = [], onBailout = () => {} } = {}) {
  const scope = new Set(files), cache = new Map();
  return (file, source) => {
    if (!scope.has(file)) return source;
    if (!cache.has(file)) {
      const events = [];
      const code = babel.transformSync(source, { filename: file, babelrc: false, configFile: false,
        parserOpts: { plugins: ['typescript', 'jsx'] },
        plugins: [['babel-plugin-react-compiler', { target: '19', logger: { logEvent: (_file, event) => events.push(event) },
          environment: { enableResetCacheOnSourceFileChanges: false } }]],
      }).code;
      if (!/react\/compiler-runtime/.test(code) && allowBailout.includes(file)) {
        assert.ok(events.some(e => e.kind === 'CompileError'), `${file}: require an explicit compiler bailout`);
        onBailout(file, events);
      } else assert.match(code, /react\/compiler-runtime/, `${file} must actually be compiled`);
      cache.set(file, code);
    }
    return cache.get(file);
  };
}
module.exports = { compilerTransform };
