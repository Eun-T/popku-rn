const { readFileSync } = require('node:fs');
const ts = require('typescript');

// Isolated API tests mock the auth store, but execute the production request wrapper.
// Real renewal/storage/race integration tests execute the entire auth module instead.
const source = readFileSync('src/lib/auth.ts', 'utf8');
const ast = ts.createSourceFile('auth.ts', source, ts.ScriptTarget.Latest, true);
const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node)
  && ['authenticatedFetch', 'accessTokenExpired'].includes(node.name?.text));
const code = ts.transpileModule(functions.map(node => node.getText(ast).replace(/^export /, '')).join('\n')
  + '\nreturn authenticatedFetch;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function authRequestMock(auth, requestFetch = (...args) => global.fetch(...args)) {
  if (auth.authenticatedFetch) return auth;
  const base = { ...auth,
    getAuthSession: auth.getAuthSession ?? (async () => ({ accessToken: await auth.getSavedAccessToken?.() ?? null,
      generation: auth.authSessionGeneration?.() ?? 0 })),
    clearTokens: async (...args) => { const result = await auth.clearTokens?.(...args); return result ?? true; },
  };
  const retriedResponses = new WeakSet();
  const authenticatedFetch = new Function('fetch', 'isAuthSessionCurrent', 'clearTokens', 'refreshAccessToken', 'getAuthSession', 'retriedResponses', code)(
    requestFetch,
    generation => !auth.authSessionGeneration || generation === auth.authSessionGeneration(),
    base.clearTokens,
    async () => { throw new Error('Expired JWT fixtures require the real auth renewal runtime'); },
    base.getAuthSession, retriedResponses,
  );
  return { ...base, authenticatedFetch, wasAuthRetried: response => retriedResponses.has(response), authSessionGeneration: auth.authSessionGeneration ?? (() => 0),
    authSessionRevision: auth.authSessionRevision ?? auth.authSessionGeneration ?? (() => 0) };
}
module.exports = { authRequestMock };
