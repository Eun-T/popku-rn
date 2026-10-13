const assert = require('node:assert/strict');
const { test } = require('node:test');
const { app, response } = require('./helpers/moderationRuntime.cjs');
const target = { targetType: 'COMMENT', targetId: 20 };

test('real DTO contract: all five single reasons, optional detail, receipt and no mutation retry', async () => {
  const s = await app();
  for (const reason of s.api.REPORT_REASONS) await s.api.reportContent(target, reason, ' 설명 ', 0);
  assert.equal(s.calls.length, 5);
  for (const call of s.calls) { assert.equal(call.url, 'https://mock.test/api/reports'); assert.deepEqual(call.body, { ...target, reason: call.body.reason, detail: '설명' }); }
  await s.api.reportContent(target, 'OTHER', '', 0);
  assert.ok(!('detail' in s.calls.at(-1).body));
  await assert.rejects(s.api.reportContent(target, 'SPAM', '😀'.repeat(201), 0), e => e.status === 400);
  const count = s.calls.length;
  s.setHandler(() => { throw Error('network'); });
  await assert.rejects(s.api.reportContent(target, 'SPAM', '', 0));
  assert.equal(s.calls.length, count + 1);
  s.dispose();
});

test('block sends only server-resolved target, accepts empty 201, duplicate 409 invalidates, unblock accepts empty 204', async () => {
  const s = await app();
  let notified = 0;
  await s.api.blockContentAuthor(target, 2, 0, () => { assert.equal(s.state.isLocallyBlocked(2), false); notified++; });
  assert.deepEqual(s.calls[0].body, target);
  assert.equal(s.state.isLocallyBlocked(2), true);
  assert.equal(notified, 1);
  s.setHandler(() => response({ error: 'already_blocked' }, 409));
  await assert.rejects(s.api.blockContentAuthor(target, 2, 0), e => e.status === 409);
  assert.equal(s.state.moderationRevision(), 2);
  s.setHandler(() => response(null, 204));
  await s.api.unblockUser(2, 0);
  assert.equal(s.calls.at(-1).url, 'https://mock.test/api/users/me/blocks/2');
  assert.equal(s.state.isLocallyBlocked(2), false);
  s.dispose();
});

test('report 409/400/404/network errors do not mutate blocks or retry; global locks drain safely', async () => {
  const s = await app();
  for (const status of [409, 400, 404]) {
    s.setHandler(() => response({}, status));
    await assert.rejects(s.api.reportContent(target, 'OTHER', '', 0), e => e.status === status);
  }
  assert.equal(s.state.moderationRevision(), 0);
  let release;
  s.setHandler(() => new Promise(resolve => { release = resolve; }));
  const pending = s.api.reportContent(target, 'SPAM', '', 0);
  await s.settle();
  await assert.rejects(s.api.reportContent(target, 'SPAM', '', 0), /already pending/);
  assert.equal(s.calls.length, 4);
  release(response({ id: 1, status: 'PENDING' }, 201)); await pending;
  s.dispose();
});

test('guest request does not fetch; stale session/late 401 cannot clear new account or publish block', async () => {
  const s = await app({ guest: true });
  await assert.rejects(s.api.reportContent(target, 'SPAM', '', 0), e => e.status === 401);
  assert.equal(s.calls.length, 0);
  s.changeUser({ id: 1 });
  let release;
  s.setHandler(() => new Promise(resolve => { release = resolve; }));
  const pending = s.api.blockContentAuthor(target, 2, 1);
  await s.settle(); s.changeUser({ id: 99 });
  release(response({}, 401)); await assert.rejects(pending, /superseded/);
  assert.equal(s.auth.getAuthUser().id, 99);
  assert.equal(s.state.isLocallyBlocked(2), false);
  await assert.rejects(s.api.blockContentAuthor(target, 2, 1), /superseded/);
  assert.equal(s.calls.length, 1);
  s.dispose();
});

test('opaque block cursor is encoded and page parsed; block change rejects delayed page', async () => {
  const s = await app();
  const page = { items: [{ blockedUserId: 2, nickname: 'writer', avatarUrl: null, createdAt: '2026-10-10' }], nextCursor: 'next/value+=' };
  s.setHandler(() => response(page));
  assert.deepEqual(await s.api.getBlockedUsers('cursor/+=', new AbortController().signal, 0), page);
  const url = new URL(s.calls[0].url);
  assert.equal(url.searchParams.get('limit'), '20'); assert.equal(url.searchParams.get('cursor'), 'cursor/+=');
  let release;
  s.setHandler(() => new Promise(resolve => { release = resolve; }));
  const pending = s.api.getBlockedUsers(null, new AbortController().signal, 0);
  await s.settle(); s.state.publishBlockChange(2, false, 0);
  release(response(page)); await assert.rejects(pending, /superseded/);
  s.dispose();
});

test('all related real GET parsers reject pre-block bodies even if transport ignores abort', async () => {
  const s = await app();
  const community = s.load('src/lib/community.ts'), reviews = s.load('src/lib/reviews.ts'), comments = s.load('src/lib/communityComments.ts');
  const cases = [
    [signal => community.getCommunityFeed('ALL', 'LATEST', null, signal), { items: [s.post, s.review], nextCursor: null }],
    [signal => community.getCommunityPost(10, signal), s.post],
    [signal => reviews.getReviewDetail(10, signal), s.review],
    [signal => reviews.getPopupReviews('popup', null, signal), { items: [s.review], nextCursor: null }],
    [signal => comments.getCommunityComments(10, signal), { items: [s.root, s.reply], commentCount: 2 }],
    [signal => comments.getCommunityComments(10, signal, 'REVIEW'), { items: [s.root, s.reply], commentCount: 2 }],
  ];
  for (const [read, body] of cases) {
    let release;
    s.setHandler(() => new Promise(resolve => { release = resolve; }));
    const pending = read(new AbortController().signal);
    await s.settle(); s.state.publishBlockChange(2, true, 0);
    release(response(body)); await assert.rejects(pending, /superseded/);
  }
  s.dispose();
});

test('blocked root and normal reply remain intact; boolean contract is validated for POST and REVIEW', async () => {
  const s = await app();
  const comments = s.load('src/lib/communityComments.ts');
  const masked = { ...s.root, isBlocked: true, content: '차단한 사용자의 댓글입니다.', author: { ...s.root.author, nickname: '', avatarUrl: null } };
  s.setHandler(() => response({ items: [masked, s.reply], commentCount: 2 }));
  for (const type of ['POST', 'REVIEW']) {
    const page = await comments.getCommunityComments(10, new AbortController().signal, type);
    assert.equal(page.items[0].id, 20); assert.equal(page.items[0].isBlocked, true);
    assert.equal(page.items[1].parentCommentId, 20); assert.equal(page.items[1].content, 'normal reply');
  }
  s.setHandler(() => response({ items: [{ ...masked, isBlocked: 'true' }], commentCount: 1 }));
  await assert.rejects(comments.getCommunityComments(10, new AbortController().signal), /Invalid/);
  s.dispose();
});
