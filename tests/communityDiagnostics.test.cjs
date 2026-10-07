const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const ts = require('typescript');

function load(file, mocks = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', code)((name) => mocks[name], module, module.exports);
  return module.exports;
}
const diagnostics = load('src/lib/communityDiagnostics.ts');

async function captureLogs(fn) {
  const oldDev = global.__DEV__;
  const oldConsole = console.error;
  const logs = [];
  global.__DEV__ = true;
  console.error = (...args) => logs.push(args);
  try { await fn(logs); }
  finally { console.error = oldConsole; global.__DEV__ = oldDev; }
}

test('API failure retains status/body/path; signed URLs and credentials never reach diagnostic logs', async () => {
  const body = JSON.stringify({ message: 'AccessDenied', accessToken: 'access-secret', uploadToken: 'upload-secret',
    AWS_ACCESS_KEY_ID: 'nonstandard-key-secret', secret_access_key: 'aws-secret', 'X-Amz-Credential': 'scope-secret',
    uploadUrl: 'https://s3.example/object?X-Amz-Credential=credential-secret',
    details: '<StringToSign>credential-secret</StringToSign><AWSAccessKeyId>key-secret</AWSAccessKeyId>' });
  const api = load('src/lib/community.ts', {
    '../constants/api': { API_BASE_URL: 'https://api.example' },
    './auth': { getAuthSession: async () => ({ accessToken: 'bearer-secret', generation: 0 }) },
    './communityDiagnostics': diagnostics,
  });
  const oldFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 403, text: async () => body });
  try {
    await captureLogs(async (logs) => {
      await assert.rejects(api.communityRequest('post-image-uploads', 'POST', { count: 1 }),
        (error) => error instanceof api.CommunityApiError && error.status === 403 && error.responseBody.includes('AccessDenied'));
      assert.equal(logs[0][1].stage, 'PRESIGN');
      assert.equal(logs[0][1].method, 'POST');
      assert.equal(logs[0][1].path, '/api/community/post-image-uploads');
      assert.equal(logs[0][1].status, 403);
      const output = JSON.stringify(logs);
      for (const secret of ['access-secret', 'upload-secret', 'credential-secret', 'key-secret', 'bearer-secret', 'nonstandard-key-secret', 'aws-secret', 'scope-secret', 'https://s3.example']) {
        assert.equal(output.includes(secret), false);
      }
    });
  } finally { global.fetch = oldFetch; }
});

test('POST_CREATE logs malformed successful responses without losing status, and body read failure does not mask HTTP failure', async () => {
  const api = load('src/lib/community.ts', {
    '../constants/api': { API_BASE_URL: 'https://api.example' },
    './auth': { getAuthSession: async () => ({ accessToken: 'token', generation: 0 }) },
    './communityDiagnostics': diagnostics,
  });
  const oldFetch = global.fetch;
  try {
    await captureLogs(async (logs) => {
      global.fetch = async () => ({ ok: true, status: 201, text: async () => '{"id":"wrong"}' });
      await assert.rejects(api.createCommunityPost('FREE', 'text'), /Invalid community post response/);
      assert.equal(logs[0][1].stage, 'POST_CREATE');
      assert.equal(logs[0][1].status, 201);
      assert.equal(logs[0][1].responseBody, '{"id":"wrong"}');
      global.fetch = async () => ({ ok: false, status: 500, text: async () => { throw new Error('read failed'); } });
      await assert.rejects(api.createCommunityPost('FREE', 'text'), (error) => error.status === 500);
      assert.equal(logs[1][1].responseBody, '[Response body unavailable]');
    });
  } finally { global.fetch = oldFetch; }
});

test('network errors are sanitized and production diagnostics are silent', async () => {
  await captureLogs(async (logs) => {
    diagnostics.logCommunityError('S3_PUT', { method: 'PUT', imageIndex: 2 },
      new Error('Request failed https://s3.example/path?X-Amz-Signature=secret'));
    assert.equal(logs[0][1].errorMessage.includes('https://'), false);
    global.__DEV__ = false;
    diagnostics.logCommunityError('REGISTER', {}, new Error('failed'));
    assert.equal(logs.length, 1);
  });
});

test('S3 signature diagnostics project safe header fields without exposing canonical queries or credentials', async () => {
  const request = diagnostics.describeS3Put(
    'https://s3.example/object?X-Amz-SignedHeaders=content-type%3Bhost&X-Amz-Credential=private-key&X-Amz-Signature=private-signature',
    new TextEncoder().encode('webp-bytes').buffer,
  );
  assert.equal(request.signedHeaders, 'content-type;host');
  assert.equal(request.contentType, 'image/webp');
  assert.equal(request.bodyType, 'ArrayBuffer');
  assert.equal(request.bodySize, 10);
  const response = await diagnostics.readS3PutError({ text: async () =>
    '<Error><Code>SignatureDoesNotMatch</Code><CanonicalRequest>PUT\n/private/object\nX-Amz-Credential=private-key\ncontent-type:application/octet-stream\nhost:s3.example\n\ncontent-type;host\nUNSIGNED-PAYLOAD</CanonicalRequest>'
      + '<StringToSign>private-signature</StringToSign></Error>' });
  assert.equal(response.actualMethod, 'PUT');
  assert.equal(response.actualContentType, 'application/octet-stream');
  assert.equal(response.canonicalRequestPresent, true);
  assert.equal(response.actualContentTypePresent, true);
  assert.equal(response.actualSignedHeaders, 'content-type;host');
  assert.ok(response.responseBody.includes('SignatureDoesNotMatch'));
  const output = JSON.stringify({ ...request, ...response });
  for (const secret of ['private-key', 'private-signature', '/private/object', 'https://s3.example']) {
    assert.equal(output.includes(secret), false);
  }
});

test('S3 canonical diagnostics distinguish an empty Content-Type from an absent header or canonical request', async () => {
  for (const newline of ['\n', '\r\n', '&#10;', '&#x0A;']) {
    const canonical = ['PUT', '/object', 'X-Amz-Signature=secret', 'content-type:', 'host:s3.example', '', 'content-type;host', 'UNSIGNED-PAYLOAD'].join(newline);
    const result = await diagnostics.readS3PutError({ text: async () => `<Error><CanonicalRequest>${canonical}</CanonicalRequest></Error>` });
    assert.equal(result.actualContentType, '');
    assert.equal(result.canonicalRequestPresent, true);
    assert.equal(result.actualContentTypePresent, true);
    assert.equal(result.actualMethod, 'PUT');
    assert.equal(result.actualSignedHeaders, 'content-type;host');
    assert.equal(result.responseBody.includes('secret'), false);
  }
  const absentHeader = await diagnostics.readS3PutError({ text: async () => '<CanonicalRequest>PUT\n/object\n\nhost:s3.example\n\nhost\nUNSIGNED-PAYLOAD</CanonicalRequest>' });
  assert.equal(absentHeader.canonicalRequestPresent, true);
  assert.equal(absentHeader.actualContentTypePresent, false);
  assert.equal(absentHeader.actualContentType, undefined);
  const absentCanonical = await diagnostics.readS3PutError({ text: async () => '<Error><Code>AccessDenied</Code></Error>' });
  assert.equal(absentCanonical.canonicalRequestPresent, false);
  assert.equal(absentCanonical.actualContentTypePresent, undefined);
  const parameterized = await diagnostics.readS3PutError({ text: async () => '<CanonicalRequest>PUT\n/object\n\ncontent-type:image/webp; charset=utf-8\n\ncontent-type;host\nUNSIGNED-PAYLOAD</CanonicalRequest>' });
  assert.equal(parameterized.actualContentType, 'image/webp; charset=utf-8');
});
