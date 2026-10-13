const assert = require('node:assert/strict');
const { test } = require('node:test');
const { app, files, inputs, button } = require('./helpers/accountI18nRuntime.cjs');
const { nodes } = require('./helpers/i18nRuntime.cjs');
const { compilerTransform } = require('./helpers/reactCompiler.cjs');

const ageLabel = '[필수] 만 14세 이상입니다.';
for (const [file, method, endpoint, fields] of [
  ['signup', 'registerUser', '/api/users', { email: 'new@example.test', password: 'Password123', signupProof: 'proof' }],
  ['googleAuth', 'completeGoogleSignup', '/api/auth/google/complete', { signupToken: 'google-ticket', deviceId: 'device' }],
  ['appleAuth', 'completeAppleSignup', '/api/auth/apple/complete', { signupToken: 'apple-ticket', deviceId: 'device' }],
]) test(`${file}: final signup JSON includes top-level ageConfirmed and unchanged consents`, async () => {
  const { readFileSync } = require('node:fs');
  const ts = require('typescript');
  const module = { exports: {} }, requests = [];
  const mocks = {
    '../constants/api': { API_BASE_URL: 'https://api.example.test' },
    './auth': { DEVICE_ID: 'device' },
    'react-native': { Platform: { OS: 'ios' } },
    'expo-apple-authentication': {},
  };
  const code = ts.transpileModule(readFileSync(`src/lib/${file}.ts`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', 'fetch', code)(name => {
    assert.ok(name in mocks); return mocks[name];
  }, module, module.exports, async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return new Response(JSON.stringify({ accessToken: 'access', refreshToken: 'refresh' }), { status: 201 });
  });
  const request = { ...fields, nickname: 'tester', ageConfirmed: true,
    consents: { termsOfService: true, privacyPolicy: true, marketing: false } };
  await module.exports[method](request);
  assert.deepEqual(requests, [{ url: `https://api.example.test${endpoint}`, body: request }]);
});

for (const compiled of [false, true]) for (const mode of ['email', 'google', 'apple']) {
  test(`${compiled ? 'Compiler' : 'Hook'} ${mode}: age confirmation blocks signup independently of all consents and survives language changes`, async () => {
    const requests = [], sessions = [];
    const complete = async request => { requests.push(request); return {}; };
    const s = await app(compiled ? compilerTransform([files[1], 'src/hooks/useTranslation.ts']) : undefined, false, {
      'expo-router': { useLocalSearchParams: () => mode === 'email' ? {} : { mode },
        useRouter: () => ({ dismissTo() {}, push() {} }), useNavigation: () => ({ dispatch() {} }) },
      'src/lib/signup.ts': { SignupApiError: class extends Error {}, registerUser: complete },
      'src/lib/googleAuth.ts': { GoogleAuthApiError: class extends Error {}, getGoogleSignupToken: () => 'google-ticket',
        clearGoogleSignup() {}, completeGoogleSignup: complete },
      'src/lib/appleAuth.ts': { getAppleSignupToken: () => 'apple-ticket', clearAppleSignup() {}, completeAppleSignup: complete },
      'src/hooks/useLoginAttempt.ts': { useLoginAttempt: () => ({ begin: () => ({}), active: () => true,
        authenticate: async () => { sessions.push('authenticate'); return true; }, complete: () => true, release() {} }) },
    });
    try {
      const Screen = s.load(files[1]).default, root = s.mount(() => Screen());
      if (mode === 'email') {
        inputs(root)[0].props.onChangeText('new@example.test');
        button(s, root, '인증번호 받기').props.onPress(); await s.settle();
        inputs(root)[1].props.onChangeText('123456');
        button(s, root, '인증하기').props.onPress(); await s.settle();
        inputs(root)[2].props.onChangeText('Password123'); inputs(root)[3].props.onChangeText('Password123');
        button(s, root, '다음').props.onPress();
      }
      inputs(root)[0].props.onChangeText('tester');
      await button(s, root, '다음').props.onPress(); await s.settle();
      const age = () => button(s, root, ageLabel);
      const assertConsentLayout = () => {
        const items = nodes(root.tree).filter(n => n.type?.name === 'ConsentRow'
          || (n.type === 'Pressable' && n.props.accessibilityRole === 'checkbox'));
        assert.deepEqual(items.map(n => n.props.label ?? n.props.accessibilityLabel),
          ['전체 동의', '[필수] 서비스 이용약관', '[필수] 개인정보 처리방침', ageLabel].map(k => s.text(k)));
        assert.equal(button(s, root, '[선택] 마케팅 정보 수신 동의'), undefined);
        assert.equal(nodes(age()).filter(n => n.type?.name === 'ChevronRight').length, 0);
      };
      assertConsentLayout();
      assert.equal(age().props.accessibilityState.checked, false);
      button(s, root, '전체 동의').props.onPress();
      assert.equal(button(s, root, '전체 동의').props.accessibilityState.checked, true);
      assert.equal(age().props.accessibilityState.checked, false);
      assert.equal(button(s, root, '가입하기').props.disabled, true);
      await button(s, root, '가입하기').props.onPress();
      assert.deepEqual(requests, []); assert.deepEqual(sessions, []);
      age().props.onPress();
      assert.equal(button(s, root, '가입하기').props.disabled, false);
      button(s, root, '전체 동의').props.onPress();
      assert.equal(age().props.accessibilityState.checked, true);
      assert.equal(button(s, root, '가입하기').props.disabled, true);
      const rows = () => nodes(root.tree).filter(n => n.type?.name === 'ConsentRow');
      rows()[0].props.onToggle(); rows()[1].props.onToggle();
      assert.equal(button(s, root, '전체 동의').props.accessibilityState.checked, true);
      const calls = s.calls.slice(), slots = root.slots;
      for (const lang of ['ja', 'ko', 'system']) {
        await s.language(lang);
        assertConsentLayout();
        assert.equal(age().props.accessibilityLabel, lang === 'ko' ? ageLabel : '[必須] 14歳以上です');
        assert.equal(age().props.accessibilityState.checked, true);
        assert.equal(root.slots, slots); assert.deepEqual(s.calls, calls);
        assert.equal(button(s, root, '가입하기').props.disabled, false);
      }
      await s.system('ko-KR'); assert.equal(age().props.accessibilityLabel, ageLabel);
      age().props.onPress();
      await button(s, root, '가입하기').props.onPress(); assert.deepEqual(requests, []);
      age().props.onPress();
      await button(s, root, '가입하기').props.onPress(); await s.settle();
      assert.equal(requests.length, 1);
      assert.equal(requests[0].ageConfirmed, true);
      assert.deepEqual(requests[0].consents, { termsOfService: true, privacyPolicy: true, marketing: false });
      assert.equal(sessions.length, mode === 'email' ? 0 : 1);
    } finally { s.dispose(); }
  });
}
