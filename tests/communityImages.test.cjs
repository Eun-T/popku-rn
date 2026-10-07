const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const ts = require('typescript');
const diagnosticsModule = { exports: {} };
const webpBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 255, 0x57, 0x45, 0x42, 0x50]);
new Function('module', 'exports', ts.transpileModule(readFileSync('src/lib/communityDiagnostics.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(diagnosticsModule, diagnosticsModule.exports);

function setup() {
  const calls = [];
  let assets = [];
  let granted = true;
  let canceled = false;
  let decoded;
  let failPut = false;
  let failCreate;
  let deleteFails = false;
  const renderGates = new Map();
  class ApiError extends Error { constructor(status) { super(); this.status = status; } }
  const source = readFileSync('src/lib/communityImages.ts', 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mocks = {
    'expo-image-picker': {
      requestMediaLibraryPermissionsAsync: async () => ({ granted }),
      launchImageLibraryAsync: async (options) => { calls.push(['picker', options]); return { canceled, assets }; },
    },
    'expo-image-manipulator': { SaveFormat: { WEBP: 'webp' }, ImageManipulator: {
      manipulate(uri) {
        calls.push(['manipulate', uri]);
        const asset = assets.find((item) => item.uri === uri);
        const dimensions = decoded || { width: asset.width, height: asset.height };
        let size = dimensions;
        return {
          resize(next) {
            calls.push(['resize', next]);
            const scale = next.width ? next.width / dimensions.width : next.height / dimensions.height;
            size = { width: Math.round(dimensions.width * scale), height: Math.round(dimensions.height * scale) };
          },
          async renderAsync() { await renderGates.get(uri); return { ...size, release() {}, async saveAsync(options) {
            calls.push(['save', options]); return { uri: `${uri}.webp`, ...size };
          } }; },
          release() {},
        };
      },
    } },
    './community': {
      CommunityApiError: ApiError,
      async communityRequest(path, method, body) {
        calls.push(['api', path, method, body]);
        if (method === 'DELETE') { if (deleteFails) throw new Error('offline'); return {}; }
        return { status: 201, text: async () => JSON.stringify({ uploadToken: 'session', images: Array.from({ length: body.count }, (_, i) => ({
          imageKey: `community/posts/session/${i}.webp`, uploadUrl: `https://s3/${i}?X-Amz-SignedHeaders=content-type%3Bhost`, contentType: 'image/webp', sortOrder: i,
        })) }) };
      },
      async createCommunityPost(...args) {
        calls.push(['create', ...args]);
        if (failCreate) throw failCreate;
        return { id: 73 };
      },
    },
    './communityDiagnostics': diagnosticsModule.exports,
  };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)((name) => mocks[name], module, module.exports);
  return {
    ...module.exports, calls, ApiError,
    setAssets(value) { assets = value; }, setGranted(value) { granted = value; }, setCanceled(value) { canceled = value; },
    setDecoded(value) { decoded = value; }, setFailPut(value) { failPut = value; }, setFailCreate(value) { failCreate = value; },
    setDeleteFails(value) { deleteFails = value; },
    setRenderGate(uri, promise) { renderGates.set(uri, promise); },
    async fetch(url, options) {
      calls.push(['fetch', url, options]);
      return { ok: !(options?.method === 'PUT' && failPut), status: options?.method === 'PUT' && failPut ? 403 : 200,
        text: async () => '<Error><Code>AccessDenied</Code><Message>Denied</Message></Error>',
        headers: { get: () => 's3-request-id' }, arrayBuffer: async () => webpBytes.slice().buffer };
    },
  };
}
const image = (id = 1) => ({ uri: `file://${id}`, width: 1200, height: 900, mimeType: 'image/webp' });
const withFetch = async (env, fn) => {
  const original = global.fetch; global.fetch = env.fetch;
  try { await fn(); } finally { global.fetch = original; }
};

// Execute the installed SDK's real header/body normalization; mock only the native boundary.
function expoFetchAtNativeBoundary() {
  function load(file, mocks = {}) {
    const module = { exports: {} };
    const code = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    new Function('require', 'module', 'exports', code)((name) => {
      if (!(name in mocks)) throw new Error(`Unexpected SDK dependency: ${name}`);
      return mocks[name];
    }, module, module.exports);
    return module.exports;
  }
  const nativeCalls = [];
  const utils = load('node_modules/expo/src/winter/fetch/RequestUtils.ts', {
    './convertFormData': { convertFormDataAsync() { throw new Error('Unexpected FormData'); } },
    '../../utils/blobUtils': load('node_modules/expo/src/utils/blobUtils.ts'),
  });
  class Response {
    ok = true;
    status = 200;
    headers = new Headers(); // Local file responses have no MIME header, as on the device.
    async arrayBuffer() { return webpBytes.slice().buffer; }
    async blob() { throw new Error('Upload must avoid the RN Blob/base64 path'); }
  }
  const sdk = load('node_modules/expo/src/winter/fetch/fetch.ts', {
    './RequestUtils': utils,
    './FetchErrors': load('node_modules/expo/src/winter/fetch/FetchErrors.ts'),
    './FetchResponse': { FetchResponse: Response },
    './ExpoFetchModule': { ExpoFetchModule: { NativeRequest: class {
      async start(url, init, body) { nativeCalls.push({ url, init, body }); }
    } } },
  });
  return { fetch: sdk.fetch, nativeCalls };
}

test('SDK 57 reproduces empty Blob Content-Type override; binary uploads preserve signed headers at the native boundary', async () => {
  const sdk = expoFetchAtNativeBoundary();
  await sdk.fetch('https://s3.example/test', {
    method: 'PUT', headers: { 'Content-Type': 'image/webp' }, body: new Blob([webpBytes]),
  });
  assert.equal(new Headers(sdk.nativeCalls[0].init.headers).get('content-type'), '');
  for (const count of [1, 5]) {
    sdk.nativeCalls.length = 0;
    const env = setup();
    await withFetch(sdk, async () => {
      await env.publishPostWithImages('FREE', 'text', Array.from({ length: count }, (_, i) => image(i)), { current: null });
    });
    assert.equal(sdk.nativeCalls.length, count * 2);
    for (let i = 0; i < count; i++) {
      const local = sdk.nativeCalls[i * 2];
      const put = sdk.nativeCalls[i * 2 + 1];
      assert.equal(local.url, `file://${i}`);
      assert.equal(local.init.method, 'GET');
      assert.equal(put.url, `https://s3/${i}?X-Amz-SignedHeaders=content-type%3Bhost`);
      assert.equal(put.init.method, 'PUT');
      assert.deepEqual(put.init.headers, [['Content-Type', 'image/webp']]);
      assert.deepEqual(put.body, webpBytes);
    }
    assert.deepEqual(env.calls.at(-1), ['create', 'FREE', 'text', 'session']);
  }
});

test('selection maintains order, limits remaining slots, supports delete/add, and blocks six before conversion', async () => {
  for (const existing of [0, 2, 4]) {
    const env = setup();
    const current = Array.from({ length: existing }, (_, i) => image(i));
    env.setAssets(Array.from({ length: 5 - existing }, (_, i) => image(i + 10)));
    const result = await env.selectPostImages(current);
    assert.equal(result.length, 5);
    assert.equal(env.calls.find(([name]) => name === 'picker')[1].selectionLimit, 5 - existing);
    assert.equal(env.calls.find(([name]) => name === 'picker')[1].orderedSelection, true);
    assert.deepEqual(result.slice(0, existing), current);
    assert.deepEqual(result.slice(existing).map((entry) => entry.uri), Array.from({ length: 5 - existing }, (_, i) => `file://${i + 10}.webp`));
    await assert.rejects(env.selectPostImages(result), { reason: 'limit' });
    env.setAssets([image(20)]);
    assert.equal((await env.selectPostImages(result.slice(0, 4))).length, 5);
  }
  const env = setup(); env.setAssets(Array.from({ length: 6 }, (_, i) => image(i)));
  await assert.rejects(env.selectPostImages([]), { reason: 'limit' });
  assert.equal(env.calls.some(([name]) => name === 'manipulate'), false);
  assert.throws(() => env.appendPostImages(Array.from({ length: 5 }, () => image()), [image()]), { reason: 'limit' });
});

test('selected originals are exposed before sequential conversion; failures keep other successful images', async () => {
  const env = setup();
  const assets = [image(1), image(2), image(3)];
  env.setAssets(assets);
  let releaseFirst;
  env.setRenderGate(assets[0].uri, new Promise((resolve) => { releaseFirst = resolve; }));
  const secondGate = new Promise((_, reject) => { env.rejectSecond = reject; });
  env.setRenderGate(assets[1].uri, secondGate);
  const events = [];
  const selection = env.selectPostImages([], {
    onSelected(selected) { events.push(['selected', selected.map((asset) => asset.uri)]); },
    onConverted(index, output) { events.push(['converted', index, output.uri]); },
    onFailed(index) { events.push(['failed', index]); },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, [['selected', ['file://1', 'file://2', 'file://3']]]);
  assert.deepEqual(env.calls.filter(([name]) => name === 'manipulate').map((call) => call[1]), ['file://1']);
  releaseFirst();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events[1], ['converted', 0, 'file://1.webp']);
  assert.equal(env.calls.filter(([name]) => name === 'manipulate').length, 2);
  const rejected = assert.rejects(selection, { reason: 'conversion' });
  env.rejectSecond(new Error('decode failed'));
  await rejected;
  assert.deepEqual(events.slice(2), [['failed', 1], ['converted', 2, 'file://3.webp']]);
});

test('picker cancel is unchanged and permission denial never launches picker', async () => {
  const env = setup(); const current = [image()];
  env.setCanceled(true); assert.equal(await env.selectPostImages(current), current);
  env.setGranted(false); env.calls.length = 0;
  await assert.rejects(env.selectPostImages(current), { reason: 'permission' });
  assert.equal(env.calls.length, 0);
});

test('WebP quality 0.8, proportional 1600 resize, no enlargement, decoded orientation dimensions', async () => {
  for (const [width, height, expected] of [[4032, 3024, [1600, 1200]], [3024, 4032, [1200, 1600]], [1200, 900, [1200, 900]]]) {
    const env = setup(); const asset = { ...image(), width, height }; env.setAssets([asset]);
    const output = await env.convertPostImage(asset);
    assert.deepEqual([output.width, output.height], expected);
    assert.equal(output.mimeType, 'image/webp');
    assert.deepEqual(env.calls.find(([name]) => name === 'save')[1], { format: 'webp', compress: 0.8 });
    if (width === 1200) assert.equal(env.calls.some(([name]) => name === 'resize'), false);
  }
  const env = setup(); env.setAssets([{ ...image(), width: 4032, height: 3024 }]);
  env.setDecoded({ width: 3024, height: 4032 });
  const result = await env.convertPostImage({ ...image(), width: 4032, height: 3024 });
  assert.deepEqual([result.width, result.height], [1200, 1600]);
  assert.throws(() => env.resizeForPost(0, 1), { reason: 'conversion' });
});

test('one and five images upload only converted WebP URIs in order before post commit', async () => {
  for (const count of [1, 5]) {
    const env = setup(); const attempt = { current: null };
    await withFetch(env, async () => {
      assert.deepEqual(await env.publishPostWithImages('FREE', 'body', Array.from({ length: count }, (_, i) => image(i)), attempt), { id: 73 });
    });
    const puts = env.calls.filter(([name, , options]) => name === 'fetch' && options?.method === 'PUT');
    assert.equal(puts.length, count);
    for (const [, , options] of puts) {
      assert.equal(options.headers['Content-Type'], 'image/webp');
      assert.ok(options.body instanceof ArrayBuffer);
      assert.deepEqual(new Uint8Array(options.body), webpBytes);
    }
    assert.deepEqual(env.calls.at(-1), ['create', 'FREE', 'body', 'session']);
    assert.equal(attempt.current, null);
  }
});

test('PUT failure cancels reservation even if cleanup is offline and never creates a post', async () => {
  const env = setup(); env.setFailPut(true); env.setDeleteFails(true);
  const attempt = { current: null };
  await withFetch(env, async () => assert.rejects(env.publishPostWithImages('QUESTION', 'body', [image()], attempt)));
  assert.ok(env.calls.some(([name, path, method, body]) => name === 'api' && path === 'post-image-uploads'
    && method === 'DELETE' && body.uploadToken === 'session'));
  assert.equal(env.calls.some(([name]) => name === 'create'), false);
  assert.equal(attempt.current, null);
});

test('S3 failure logs XML, status and one-based image index before cleanup; local read fails at LOCAL_FILE', async () => {
  const env = setup();
  const oldDev = global.__DEV__;
  const oldConsole = console.error;
  const logs = [];
  global.__DEV__ = true;
  console.error = (...args) => logs.push(args);
  const originalFetch = env.fetch;
  env.fetch = async (url, options) => {
    if (url.startsWith('https://s3/1?') && options?.method === 'PUT') env.setFailPut(true);
    return originalFetch(url, options);
  };
  try {
    await withFetch(env, async () => assert.rejects(env.publishPostWithImages('FREE', 'text', [image(1), image(2)], { current: null })));
    assert.equal(logs[0][1].stage, 'S3_PUT');
    assert.equal(logs[0][1].imageIndex, 2);
    assert.equal(logs[0][1].status, 403);
    assert.equal(logs[0][1].signedHeaders, 'content-type;host');
    assert.equal(logs[0][1].contentType, 'image/webp');
    assert.equal(logs[0][1].bodyType, 'ArrayBuffer');
    assert.equal(logs[0][1].bodySize, webpBytes.byteLength);
    assert.ok(logs[0][1].responseBody.includes('<Code>AccessDenied</Code>'));
    assert.equal(logs[0][1].requestId, 's3-request-id');
    assert.equal(JSON.stringify(logs).includes('https://s3/'), false);
    env.fetch = async () => { throw new Error('file cannot be read'); };
    await withFetch(env, async () => assert.rejects(env.publishPostWithImages('FREE', 'text', [image()], { current: null })));
    assert.equal(logs[1][1].stage, 'LOCAL_FILE');
    assert.equal(logs[1][1].imageIndex, 1);
    assert.equal(logs[1][1].errorMessage, 'file cannot be read');
  } finally { console.error = oldConsole; global.__DEV__ = oldDev; }
});

test('ambiguous commit retains immutable session for idempotent retry; definite rejection cleans up', async () => {
  const env = setup(); const attempt = { current: null };
  env.setFailCreate(new Error('lost response'));
  await withFetch(env, async () => assert.rejects(env.publishPostWithImages('QUESTION', 'original', [image()], attempt)));
  assert.equal(attempt.current.uploadToken, 'session');
  assert.equal(env.calls.some(([name, , method]) => name === 'api' && method === 'DELETE'), false);
  env.setFailCreate(null);
  await withFetch(env, async () => env.publishPostWithImages('FREE', 'changed', [image()], attempt));
  assert.deepEqual(env.calls.at(-1), ['create', 'QUESTION', 'original', 'session']);
  assert.equal(env.calls.filter(([name]) => name === 'api').length, 1);
  env.setFailCreate(new env.ApiError(400));
  await withFetch(env, async () => assert.rejects(env.publishPostWithImages('FREE', 'new', [image()], attempt)));
  assert.equal(attempt.current, null);
  assert.equal(env.calls.at(-1)[2], 'DELETE');
});
