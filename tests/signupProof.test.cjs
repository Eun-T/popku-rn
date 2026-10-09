const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const ts = require('typescript');

function productionFunction(file, name, scope) {
  const {loadPure}=require('./helpers/uiDependencies.cjs');
  scope={accountUiKey:loadPure('src/locales/accountUi.ts').accountUiKey,...scope};
  const ast = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  let declaration;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) declaration = node;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(declaration, `${name} must exist`);
  const source = declaration.getText(ast).replace(/^export\s+/, '');
  const js = ts.transpileModule(`${source}\nreturn ${name};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return new Function(...Object.keys(scope), js)(...Object.values(scope));
}

const verificationFile = 'src/lib/emailVerification.ts';
const signupFile = 'src/lib/signup.ts';
const screenFile = 'src/app/(tabs)/profile/signup.tsx';

function verifyWith(response, requestDetails = () => {}) {
  return productionFunction(verificationFile, 'verifyEmailCode', {
    API_BASE_URL: 'https://api.example.test', __DEV__: false,
    fetch: async (url, options) => { requestDetails(url, options); return response; },
    requireSuccess: async (result) => { if (!result.ok) throw Error('HTTP error'); },
  });
}

test('verify 200 reads a non-empty signupProof and preserves the request body', async () => {
  const verify = verifyWith(new Response(JSON.stringify({ signupProof: 'proof.jwt.value' }), { status: 200 }),
    (url, options) => {
      assert.equal(url, 'https://api.example.test/api/auth/email-verifications/verify');
      assert.deepEqual(JSON.parse(options.body), { email: 'user@example.com', code: '123456' });
    });
  assert.equal(await verify('user@example.com', '123456'), 'proof.jwt.value');
});

test('verify rejects missing, empty, whitespace, and non-string proof without marking success', async () => {
  for (const body of [{}, { signupProof: '' }, { signupProof: '  ' }, { signupProof: 123 }, { signupProof: null }]) {
    await assert.rejects(verifyWith(new Response(JSON.stringify(body), { status: 200 }))('user@example.com', '123456'),
      /Invalid email verification response/);
  }
  await assert.rejects(verifyWith(new Response(null, { status: 204 }))('user@example.com', '123456'));
});

test('signup API sends the proof at the top level alongside unchanged consents', async () => {
  const request = {
    email: 'user@example.com', password: 'Passw0rdLong', nickname: 'tester', signupProof: 'proof.jwt.value',
    consents: { termsOfService: true, privacyPolicy: true, marketing: false },
  };
  const register = productionFunction(signupFile, 'registerUser', {
    API_BASE_URL: 'https://api.example.test',
    fetch: async (url, options) => {
      assert.equal(url, 'https://api.example.test/api/users');
      assert.deepEqual(JSON.parse(options.body), request);
      return new Response(null, { status: 201 });
    },
  });
  await register(request);
});

test('verification with a valid proof stores it and marks the email verified', async () => {
  const calls = [];
  const requestVersionRef = { current: 0 };
  const verify = productionFunction(screenFile, 'handleVerify', {
    verificationStage: 'code', canVerify: true, email: 'user@example.com', code: '123456',
    requestVersionRef,
    beginRequest: () => requestVersionRef.current,
    finishRequest: () => {}, setCodeError: () => {},
    verifyEmailCode: async () => 'proof.jwt.value',
    setSignupProof: (value) => calls.push(['proof', value]),
    setVerificationStage: (value) => calls.push(['stage', value]),
    verifyErrorMessage: () => 'verify error', Keyboard: { dismiss: () => calls.push(['keyboard']) },
  });
  await verify();
  assert.deepEqual(calls, [
    ['proof', null],
    ['proof', 'proof.jwt.value'],
    ['keyboard'],
    ['stage', 'verified'],
  ]);
});

test('verification advances only with proof and ignores an old response after email changes', async () => {
  let verificationStage = 'code', signupProof = null, resolveProof;
  const requestVersionRef = { current: 0 }, pendingRef = { current: false }, calls = [];
  const scope = {
    verificationStage, canVerify: true, email: 'first@example.com', code: '123456',
    requestVersionRef, pendingRef, setSignupProof: (value) => { signupProof = value; calls.push(['proof', value]); },
    setVerificationStage: (value) => { verificationStage = value; calls.push(['stage', value]); },
    setEmail: (value) => calls.push(['email', value]), setCode: (value) => calls.push(['code', value]),
    setPending: () => {}, setEmailError: () => {}, setCodeError: () => {},
    setSecondsLeft: () => {}, setResendSecondsLeft: () => {},
    beginRequest: () => { pendingRef.current = true; return requestVersionRef.current; },
    finishRequest: () => { pendingRef.current = false; },
    verifyEmailCode: () => new Promise((resolve) => { resolveProof = resolve; }),
    verifyErrorMessage: () => 'verify error', Keyboard: { dismiss: () => {} },
    VERIFICATION_SECONDS: 300,
  };
  const verifying = productionFunction(screenFile, 'handleVerify', scope)();
  productionFunction(screenFile, 'handleEmailChange', scope)('second@example.com');
  resolveProof('old-proof');
  await verifying;
  assert.equal(signupProof, null);
  assert.equal(verificationStage, 'email');
  assert.ok(!calls.some(([name, value]) => name === 'proof' && value === 'old-proof'));
  assert.ok(!calls.some(([name, value]) => name === 'stage' && value === 'verified'));
});

test('a new verification or resend clears the previous proof before the request completes', async () => {
  for (const name of ['handleReceiveCode', 'handleResend', 'handleVerify']) {
    const calls = [], pendingRef = { current: false }, requestVersionRef = { current: 0 };
    let resolveRequest;
    const scope = {
      canReceiveCode: true, verificationStage: 'code', resendSecondsLeft: 0, canVerify: true,
      email: 'user@example.com', code: '123456', requestVersionRef, pendingRef,
      setSignupProof: (value) => calls.push(['proof', value]), setEmailError: () => {},
      setCodeError: () => {}, setCode: () => {}, setSecondsLeft: () => {},
      setResendSecondsLeft: () => {}, setVerificationStage: () => {},
      checkEmailAvailability: async () => true,
      sendEmailVerification: () => new Promise((resolve) => { resolveRequest = resolve; }),
      verifyEmailCode: () => new Promise((resolve) => { resolveRequest = resolve; }),
      beginRequest: () => { pendingRef.current = true; return requestVersionRef.current; },
      finishRequest: () => { pendingRef.current = false; },
      sendErrorMessage: () => 'send error', verifyErrorMessage: () => 'verify error',
      Keyboard: { dismiss: () => {} }, VERIFICATION_SECONDS: 300, RESEND_COOLDOWN_SECONDS: 60,
    };
    const request = productionFunction(screenFile, name, scope)();
    await Promise.resolve(); // receive-code checks availability first
    assert.deepEqual(calls[0], ['proof', null], name);
    resolveRequest(name === 'handleVerify' ? 'new-proof' : undefined);
    await request;
  }
});

function joinScope(registerUser) {
  let proof = 'proof.jwt.value';
  const calls = [], signupRequest = [];
  const scope = {
    canJoin: true, joiningRef: { current: false }, isGoogle: false, signupProof: proof, target: null,
    signupDraft: { email: 'user@example.com', password: 'Passw0rdLong', nickname: 'tester',
      termsAccepted: true, privacyAccepted: true, marketingAccepted: false },
    setJoining: () => {}, setJoinError: (value) => calls.push(['joinError', value]),
    setSignupProof: (value) => { proof = value; calls.push(['proof', value]); },
    registerUser: async (request) => { signupRequest.push(request); return registerUser(request); },
    SignupApiError: class SignupApiError extends Error { constructor(status) { super(); this.status = status; } },
    joinErrorMessage: () => '가입 실패',
    setVerificationStage: (value) => calls.push(['stage', value]),
    setSignupStep: (value) => calls.push(['step', value]),
    setEmailError: (value) => {
      const {loadPure}=require('./helpers/uiDependencies.cjs');
      const ui=loadPure('src/locales/accountUi.ts'),locale=loadPure('src/locales/index.ts');
      calls.push(['emailError',ui.accountUiText((key)=>locale.translate('ko',key),value)]);
    },
    setCode: (value) => calls.push(['code', value]),
    setPassword: () => {}, setPasswordConfirmation: () => {}, setEmail: () => {},
    setNickname: () => {}, setConfirmedNickname: () => {},
    Keyboard: { dismiss: () => {} }, router: { dismissTo: (route) => calls.push(['route', route]) },
  };
  return { scope, calls, signupRequest, getProof: () => proof };
}

test('successful signup sends and discards proof before leaving the signup screen', async () => {
  const state = joinScope(async () => {});
  await productionFunction(screenFile, 'handleJoin', state.scope)();
  assert.equal(state.signupRequest[0].signupProof, 'proof.jwt.value');
  assert.equal(state.getProof(), null);
  assert.ok(state.calls.findIndex(([name]) => name === 'proof') < state.calls.findIndex(([name]) => name === 'route'));
});

test('network signup failure retains proof so the same flow can retry', async () => {
  let attempts = 0;
  const state = joinScope(async () => { if (++attempts === 1) throw new TypeError('offline'); });
  await productionFunction(screenFile, 'handleJoin', state.scope)();
  assert.equal(state.getProof(), 'proof.jwt.value');
  assert.equal(state.signupRequest.length, 1);
  await productionFunction(screenFile, 'handleJoin', state.scope)();
  assert.equal(state.signupRequest.length, 2);
  assert.equal(state.signupRequest[1].signupProof, 'proof.jwt.value');
  assert.equal(state.getProof(), null);
});

test('signup 403 clears proof and returns to email verification without guessing the cause', async () => {
  const state = joinScope(async () => { throw new state.scope.SignupApiError(403); });
  await productionFunction(screenFile, 'handleJoin', state.scope)();
  assert.equal(state.getProof(), null);
  assert.ok(state.calls.some(([name, value]) => name === 'stage' && value === 'email'));
  assert.ok(state.calls.some(([name, value]) => name === 'step' && value === 'emailPassword'));
  assert.ok(state.calls.some(([name, value]) => name === 'emailError' && value.includes('다시 진행')));
});
