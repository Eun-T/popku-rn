const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const ts = require('typescript');

// Execute the production success handlers; native authentication/storage are mocked.
function handler(file, name, scope) {
  const ast = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let declaration;
  function visit(n) { if (ts.isFunctionDeclaration(n) && n.name?.text === name) declaration = n; ts.forEachChild(n, visit); }
  visit(ast); assert.ok(declaration);
  const js = ts.transpileModule(`${declaration.getText(ast).replace(/^export\s+/, '')}\nreturn ${name};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function(...Object.keys(scope), js)(...Object.values(scope));
}
for (const [label, file, name] of [
  ['email login', 'login', 'handleLogin'],
  ['Google login', 'login', 'handleGoogleLogin'],
  ['Google signup', 'signup', 'handleJoin'],
]) test(`${label} replaces with the generated tab home route after saving authentication`, async () => {
  const calls = [], noop = () => {};
  const tokens = { accessToken: 'access', refreshToken: 'refresh' }, user = { id: 1 };
  const scope = {
    __DEV__: false, loading: false, googleLoadingRef: { current: false }, email: 'user@example.com', password: 'password',
    login: async () => tokens, getGoogleIdToken: async () => 'google',
    authenticateWithGoogle: async () => ({ kind: 'login', tokens }),
    saveTokens: async (value) => { assert.equal(value, tokens); calls.push('save'); },
    getCurrentUser: async (token) => { assert.equal(token, tokens.accessToken); return user; },
    setAuthUser: (value) => { assert.equal(value, user); calls.push('user'); },
    clearTokens: async () => { throw new Error('unexpected cleanup'); },
    router: { replace: (route) => calls.push(['replace', route]), push: () => assert.fail('must preserve replace semantics') },
    GoogleAuthApiError: class extends Error {},
    setLoading: noop, setGoogleLoading: noop, setError: (error) => { assert.equal(error, ''); },
    canJoin: true, joiningRef: { current: false }, isGoogle: true, DEVICE_ID: 'device',
    signupDraft: { nickname: 'nickname', termsAccepted: true, privacyAccepted: true, marketingAccepted: false },
    getGoogleSignupToken: () => 'signup', completeGoogleSignup: async () => tokens,
    setJoining: noop, setJoinError: (error) => assert.equal(error, ''),
    setPassword: noop, setPasswordConfirmation: noop, setCode: noop, setEmail: noop, setNickname: noop, setConfirmedNickname: noop,
    Keyboard: { dismiss: noop }, clearGoogleSignup: () => calls.push('signup cleared'),
    target: null, params: {}, navigation: {}, redirected: { current: false },
  };
  scope.authentication = {
    begin: () => ({}), active: () => true, valid: () => true, complete: () => true, release: noop,
    fail: async () => assert.fail('unexpected authentication failure'),
    authenticate: async (_attempt, value) => { await scope.saveTokens(value); scope.setAuthUser(await scope.getCurrentUser(value.accessToken)); return true; },
  };
  scope.finishLoginReturn = handler('src/lib/loginReturn.ts', 'finishLoginReturn', {});
  await handler(`src/app/(tabs)/profile/${file}.tsx`, name, scope)();
  assert.deepEqual(calls, ['save', 'user', ...(file === 'signup' ? ['signup cleared'] : []), ['replace', '/(tabs)']]);
  assert.match(readFileSync('.expo/types/router.d.ts', 'utf8'), /pathname: `\$\{'\/\(tabs\)'\}` \| `\/`/);
});
