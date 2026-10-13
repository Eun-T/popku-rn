const assert = require('node:assert/strict');
const { test } = require('node:test');
const { app, button, nodes, texts, response } = require('./helpers/moderationRuntime.cjs');
const { compilerTransform } = require('./helpers/reactCompiler.cjs');
const { inspectI18nUi } = require('./helpers/i18nUiGuard.cjs');
const fs = require('node:fs');
const files = ['src/components/community/ModerationActions.tsx', 'src/components/community/ReportSheet.tsx',
  'src/components/community/CommunityPostMenu.tsx', 'src/app/profile/blocks.tsx', 'src/hooks/useTranslation.ts'];
const transform = compilerTransform(files, { allowBailout: files.slice(0,4) });
const click = node => { assert.ok(node, 'button exists'); node.props.onPress({ stopPropagation() {} }); };
const component = (s, file, props) => s.mount(() => s.load(file).default(props));

for (const platform of ['ios', 'android']) for (const kind of ['POST', 'REVIEW']) {
  test(`${platform} ${kind} list menu stops parent navigation and preserves owner edit/guest/other policy`, async () => {
    const s = await app(); s.native.Platform.OS = platform;
    s.changeUser({ id: 2 });
    const file = kind === 'POST' ? 'src/components/community/PostActions.tsx' : 'src/components/reviews/ReviewActions.tsx';
    const props = kind === 'POST' ? { post: s.post } : { review: s.review };
    const action = component(s, file, props);
    const menuLabel = s.t(kind === 'POST' ? 'community.postMenu' : 'review.menu');
    let stopped = false;
    button(action, menuLabel).props.onPress({ stopPropagation() { stopped = true; } });
    assert.equal(stopped, true); assert.deepEqual(s.routes, []);
    const menu = nodes(action.tree).find(n => n.type?.name === 'CommunityPostMenu');
    assert.ok(menu, 'owner menu opens without navigating');
    menu.props.onSelect(1);
    assert.deepEqual(s.routes, [{ pathname: kind === 'POST' ? '/community/write' : '/reviews/write', params: { editId: '10' } }]);
    await s.language('ja'); await s.language('ko'); await s.language('system');
    s.changeUser({ id: 1 });
    assert.equal(nodes(action.tree).find(n => n.type?.name === 'ModerationActions').props.targetType, kind);
    const other = component(s, files[0], { targetType: kind, targetId: 10, authorId: 2 });
    stopped = false; const before = s.routes.slice();
    button(other, s.t('moderation.menu')).props.onPress({ stopPropagation() { stopped = true; } });
    assert.equal(stopped, true); assert.deepEqual(s.routes, before);
    assert.ok(nodes(other.tree).some(n => n.type?.name === 'CommunityPostMenu'));
    s.changeUser(null); assert.equal(other.tree, null);
    assert.equal(button(action, menuLabel), undefined);
    s.dispose();
  });
}

test('community list supplies real menu actions for both content types', async () => {
  const s = await app();
  const screen = component(s, 'src/screens/CommunityScreen.tsx', {}); await s.settle();
  const list = nodes(screen.tree).find(n => n.type === 'FlatList');
  const post = list.props.renderItem({ item: s.post }), review = list.props.renderItem({ item: s.review });
  assert.equal(post.props.postActions.type.name, 'PostActions');
  assert.equal(review.props.reviewActions.type.name, 'ReviewActions');
  assert.equal(post.props.postActions.props.post.id, 10); assert.equal(review.props.reviewActions.props.review.id, 10);
  s.dispose();
});

test('post list owner delete cancels safely, submits once and refreshes the feed', async () => {
  const s = await app(); s.changeUser({ id: 2 });
  const action = component(s, 'src/components/community/PostActions.tsx', { post: s.post });
  const selectDelete = () => {
    click(button(action, s.t('community.postMenu')));
    nodes(action.tree).find(n => n.type?.name === 'CommunityPostMenu').props.onSelect(2);
    return s.alerts.at(-1)[2];
  };
  selectDelete()[0].onPress(); assert.equal(s.calls.length, 0);
  const feed = s.load('src/lib/communityFeedRefresh.ts'), changes = [];
  const unsubscribe = feed.subscribeCommunityPostChanges((...args) => changes.push(args));
  const confirm = selectDelete()[1]; confirm.onPress(); confirm.onPress(); await s.settle();
  assert.equal(s.calls.filter(c => c.method === 'DELETE' && c.url.endsWith('/community/posts/10')).length, 1);
  assert.deepEqual(changes, [[10, null, 'POST']]); assert.deepEqual(s.routes, []);
  unsubscribe();
  s.dispose();
});

test('new moderation UI obeys bound translation rules and both resources contain the same keys/variables', () => {
  for (const file of files.slice(0,4)) assert.deepEqual(inspectI18nUi(fs.readFileSync(file,'utf8'),file),[],file);
  const ko=JSON.parse(fs.readFileSync('src/locales/ko.json','utf8')).moderation;
  const ja=JSON.parse(fs.readFileSync('src/locales/ja.json','utf8')).moderation;
  assert.equal(ko.report,'신고하기');assert.equal(ja.report,'通報する');
  assert.equal(ko.blockedComment,'차단한 사용자의 댓글입니다.');
  assert.equal(ja.blockedComment,'ブロックしたユーザーのコメントです。');
  for(const resource of [ko,ja]) for(const value of Object.values(resource).flatMap(value=>typeof value==='object'?Object.values(value):[value])) {
    assert.ok(!value.includes('??') && !value.includes('\uFFFD'),'translation encoding');
  }
  assert.deepEqual(Object.keys(ko).sort(),Object.keys(ja).sort());
  assert.deepEqual(Object.keys(ko.reasons).sort(),['ABUSE','OTHER','PRIVACY','SEXUAL','SPAM']);
  assert.deepEqual(Object.keys(ko.reasons).sort(),Object.keys(ja.reasons).sort());
  for(const key of Object.keys(ko)) if(typeof ko[key]==='string') assert.deepEqual(ko[key].match(/\{\w+\}/g),ja[key].match(/\{\w+\}/g));
});

test('own/guest actions hidden; others open translated menu and iOS defers report/block until native dismiss', async () => {
  const s = await app({ transform });
  const props = { targetType: 'POST', targetId: 10, authorId: 2 };
  const action = component(s, files[0], props);
  click(button(action, s.t('moderation.menu')));
  const menuProps = () => nodes(action.tree).find(n => n.type?.name === 'CommunityPostMenu').props;
  const menu = s.mount(() => s.load(files[2]).default(menuProps()));
  click(button(menu, s.t('moderation.report')));
  assert.equal(nodes(action.tree).some(n => n.type?.name === 'ReportSheet'), false);
  assert.equal(menu.tree.props.visible, false);
  menu.tree.props.onDismiss();
  assert.equal(nodes(action.tree).some(n => n.type?.name === 'ReportSheet'), true);
  assert.equal(s.calls.length, 0);
  s.changeUser({ id: 2 }); assert.equal(action.tree, null);
  s.changeUser(null); assert.equal(action.tree, null);
  s.dispose();
});

test('report form covers five reasons, 200 codepoints, single submit, receipt only after dismissal and live language drafts', async () => {
  const s = await app({ transform }), closed = [];
  const report = component(s, files[1], { target: { targetType: 'COMMENT', targetId: 20 }, generation: 0, onClose: ok => closed.push(ok) });
  const menu = s.mount(() => s.load(files[2]).default(report.tree.props));
  const refresh = () => { menu.render(); return menu; };
  assert.equal(nodes(menu.tree).filter(n => n.props.accessibilityRole === 'radio').length, 5);
  assert.equal(button(menu, s.t('moderation.submit')).props.disabled, true);
  for (const reason of s.api.REPORT_REASONS) {
    click(nodes(refresh().tree).find(n => n.props.accessibilityRole === 'radio' && texts(n) === s.t(`moderation.reasons.${reason}`)));
    assert.equal(nodes(refresh().tree).filter(n => n.props.accessibilityRole === 'radio' && n.props.accessibilityState.checked).length, 1);
  }
  nodes(menu.tree).find(n => n.type === 'TextInput').props.onChangeText('😀'.repeat(205));
  assert.equal(nodes(refresh().tree).find(n => n.type === 'TextInput').props.value, '😀'.repeat(200));
  for (const language of ['ja','ko','system']) {
    await s.language(language); refresh();
    assert.ok(texts(menu.tree).includes(s.t('moderation.report')));
    assert.equal(nodes(menu.tree).find(n => n.type === 'TextInput').props.value, '😀'.repeat(200));
    assert.equal(nodes(menu.tree).filter(n => n.props.accessibilityRole === 'radio' && n.props.accessibilityState.checked).length, 1);
    assert.equal(s.calls.length, 0);
  }
  const submit = button(refresh(), s.t('moderation.submit'));
  click(submit); click(submit); await s.settle(); refresh();
  assert.equal(s.calls.length, 1); assert.equal(s.calls[0].body.reason, 'OTHER');
  assert.equal([...s.calls[0].body.detail].length, 200);
  assert.deepEqual(closed, []);
  menu.tree.props.onDismiss(); assert.deepEqual(closed, [true]);
  s.dispose();
});

test('duplicate report is translated inline and preserves input/reason; retry issues one fresh request', async () => {
  const s = await app({ transform });
  s.setHandler(() => response({},409));
  const report = component(s, files[1], { target: { targetType: 'REVIEW', targetId: 10 }, generation: 0, onClose() {} });
  const form = () => ({ tree: report.tree.props.content(() => {}) });
  click(nodes(form().tree).find(n => n.props.accessibilityRole === 'radio'));
  nodes(form().tree).find(n => n.type === 'TextInput').props.onChangeText('draft');
  click(button(form(), s.t('moderation.submit'))); await s.settle();
  assert.ok(texts(form().tree).includes(s.t('moderation.reportDuplicate')));
  await s.language('ja'); assert.ok(texts(form().tree).includes(s.t('moderation.reportDuplicate')));
  assert.equal(nodes(form().tree).find(n => n.type === 'TextInput').props.value, 'draft');
  assert.equal(s.calls.length, 1);
  s.setHandler(() => response({id:2,status:'PENDING'},201));
  click(button(form(), s.t('moderation.submit'))); await s.settle(); assert.equal(s.calls.length,2);
  s.dispose();
});

test('block cancellation makes no request, confirmation locks duplicates, successful block refreshes and stale confirmation does nothing', async () => {
  const s = await app({ transform });
  const action = component(s, files[0], { targetType: 'POST', targetId: 10, authorId: 2 });
  function selectBlock() {
    click(button(action,s.t('moderation.menu')));
    nodes(action.tree).find(n => n.type?.name === 'CommunityPostMenu').props.onSelect(4);
    return s.alerts.at(-1)[2][1].onPress;
  }
  const cancelled=selectBlock();s.alerts.at(-1)[2][0].onPress();cancelled();
  await s.settle();assert.equal(s.calls.length, 0);
  const confirm = selectBlock(); confirm(); confirm(); await s.settle();
  assert.equal(s.calls.length, 1); assert.equal(s.state.isLocallyBlocked(2),true);
  assert.ok(s.alerts.some(args => args[0] === s.t('moderation.blockSuccess')));
  const stale = selectBlock(); s.changeUser({ id:99 }); stale(); await s.settle();
  assert.equal(s.calls.length,1);
  s.dispose();
});

test('leaving screen prevents confirmation and late success alerts but still invalidates current-session block data', async () => {
  const s = await app();
  const action = component(s, files[0], { targetType: 'POST', targetId: 10, authorId: 2 });
  click(button(action,s.t('moderation.menu')));
  nodes(action.tree).find(n => n.type?.name === 'CommunityPostMenu').props.onSelect(4);
  s.focuses[0].cleanup(); s.alerts.at(-1)[2][1].onPress(); await s.settle();
  assert.equal(s.calls.length,0);
  s.dispose();
  const next = await app(); let release;
  next.setHandler(() => new Promise(resolve => { release=resolve; }));
  const other = component(next,files[0],{targetType:'POST',targetId:10,authorId:2});
  click(button(other,next.t('moderation.menu')));
  nodes(other.tree).find(n => n.type?.name === 'CommunityPostMenu').props.onSelect(4);
  next.alerts.at(-1)[2][1].onPress(); await next.settle(); next.focuses[0].cleanup();
  release(response(null,201)); await next.settle();
  assert.equal(next.state.isLocallyBlocked(2),true); assert.equal(next.alerts.length,1);
  next.dispose();
});

test('a renewed session for the same user closes an open report and invalidates its old confirmation', async () => {
  const s=await app();
  const action=component(s,files[0],{targetType:'POST',targetId:10,authorId:2});
  click(button(action,s.t('moderation.menu')));
  nodes(action.tree).find(n=>n.type?.name==='CommunityPostMenu').props.onSelect(3);
  assert.ok(nodes(action.tree).some(n=>n.type?.name==='ReportSheet'));
  s.changeUser({id:1,email:'me@example.test'});
  assert.equal(nodes(action.tree).some(n=>n.type?.name==='ReportSheet'),false);
  assert.equal(s.calls.length,0);
  s.dispose();
});

test('a late native report dismissal from an old session cannot close a newer report or show an old receipt',async()=>{
  const s=await app();
  const action=component(s,files[0],{targetType:'POST',targetId:10,authorId:2});
  function openReport(){
    click(button(action,s.t('moderation.menu')));
    nodes(action.tree).find(n=>n.type?.name==='CommunityPostMenu').props.onSelect(3);
    return nodes(action.tree).find(n=>n.type?.name==='ReportSheet').props.onClose;
  }
  const oldClose=openReport();s.changeUser({id:1,email:'me@example.test'});
  openReport();oldClose(true);
  assert.ok(nodes(action.tree).some(n=>n.type?.name==='ReportSheet'));
  assert.equal(s.alerts.length,0);assert.equal(s.calls.length,0);
  s.dispose();
});

for (const type of ['POST','REVIEW']) test(`${type} blocked comments hide identity/body/mentions/actions while retaining root ID and normal replies`, async () => {
  const s = await app();
  const masked = { ...s.root, isBlocked:true };
  s.setHandler(() => response({items:[masked,{...s.reply,replyToUser:null}],commentCount:2}));
  const props = {...(type==='POST'?{postId:10}:{targetId:10,targetType:'REVIEW'}),commentCount:2,now:0,padding:{paddingLeft:16,paddingRight:16},onLogin(){},children:null};
  const screen = component(s,'src/components/community/CommunityComments.tsx',props); await s.settle();
  assert.ok(texts(screen.tree).includes(s.t('moderation.blockedComment')));
  assert.ok(!texts(screen.tree).includes('root secret'));
  const root = nodes(screen.tree).find(n => n.key===20), reply = nodes(screen.tree).find(n => n.key===21);
  assert.ok(root && reply);
  assert.equal(nodes(root).some(n => n.type?.name==='CommunityAuthor' || n.type==='Pressable' || n.type?.name==='ModerationActions'), false);
  assert.ok(texts(reply).includes('normal reply'));
  await s.language('ja'); assert.ok(texts(screen.tree).includes(s.t('moderation.blockedComment')));
  assert.equal(s.calls.length,1);
  s.dispose();
});

test('local block immediately masks old root, clears its reply target, preserves draft and normal replies during refresh', async () => {
  const s=await app();
  const screen=component(s,'src/components/community/CommunityComments.tsx',{postId:10,commentCount:2,now:0,padding:{paddingLeft:16,paddingRight:16},onLogin(){},children:null});
  await s.settle();
  nodes(screen.tree).find(n=>n.type==='TextInput').props.onChangeText('draft survives');
  click(button(screen,s.t('community.comments.replyTo',{nickname:'writer'}))); await s.settle();
  let release;
  s.setHandler(()=>new Promise(resolve=>{release=resolve;}));
  s.state.publishBlockChange(2,true,0); await s.settle();
  assert.equal(nodes(screen.tree).find(n=>n.type==='TextInput').props.value,'draft survives');
  assert.equal(button(screen,s.t('community.comments.cancelReply')),undefined);
  release(response({items:[{...s.root,isBlocked:true},s.reply],commentCount:2})); await s.settle();
  assert.ok(texts(screen.tree).includes(s.t('moderation.blockedComment')));
  assert.ok(texts(screen.tree).includes('normal reply'));
  s.dispose();
});

test('a pre-block comment mutation cannot replace the refreshed draft or latch the composer', async()=>{
  const s=await app();let release;
  const screen=component(s,'src/components/community/CommunityComments.tsx',{postId:10,commentCount:2,now:0,padding:{paddingLeft:16,paddingRight:16},onLogin(){},children:null});
  await s.settle();
  nodes(screen.tree).find(n=>n.type==='TextInput').props.onChangeText('keep draft');
  s.setHandler(call=>call.method==='POST'?new Promise(resolve=>{release=resolve;}):response({items:[{...s.root,isBlocked:true},s.reply],commentCount:2}));
  click(button(screen,s.t('community.comments.register')));await s.settle();
  s.state.publishBlockChange(2,true,0);await s.settle();
  release(response({item:{...s.reply,id:22,content:'keep draft',author:{id:1,nickname:'me',avatarUrl:null},isOwner:true},commentCount:3}));await s.settle();
  const input=nodes(screen.tree).find(n=>n.type==='TextInput');
  assert.equal(input.props.value,'keep draft');assert.equal(input.props.editable,true);
  assert.equal(s.calls.filter(call=>call.method==='POST').length,1);
  assert.equal(nodes(screen.tree).some(n=>n.key===22),false);
  s.dispose();
});

test('block management handles cursor pages/deduplication, confirm/unblock and empty state; language changes do not fetch', async () => {
  const s=await app({transform});let unblocked=false;
  const row=id=>({blockedUserId:id,nickname:`user${id}`,avatarUrl:null,createdAt:'2026-10-10'});
  s.setHandler(call=>call.method==='DELETE'?(unblocked=true,response(null,204)):response({items:unblocked?[]:new URL(call.url).searchParams.has('cursor')?[row(2),row(3)]:[row(2)],nextCursor:unblocked||new URL(call.url).searchParams.has('cursor')?null:'opaque/+'}));
  const screen=component(s,files[3]);await s.settle();
  let list=nodes(screen.tree).find(n=>n.type==='FlatList');assert.equal(list.props.data.length,1);
  for(const lang of ['ja','ko','system']){await s.language(lang);assert.ok(texts(screen.tree).includes(s.t('moderation.manageBlocks')));assert.equal(s.calls.length,1);}
  click(button(screen,s.t('moderation.loadMore')));await s.settle();
  list=nodes(screen.tree).find(n=>n.type==='FlatList');assert.deepEqual(list.props.data.map(i=>i.blockedUserId),[2,3]);
  assert.equal(new URL(s.calls.at(-1).url).searchParams.get('cursor'),'opaque/+');
  const rowTree={tree:list.props.renderItem({item:list.props.data[0]})};
  click(button(rowTree,s.t('moderation.unblockUser',{nickname:'user2'})));
  assert.equal(s.calls.length,2);
  s.alerts.at(-1)[2][1].onPress();s.alerts.at(-1)[2][1].onPress();await s.settle();
  assert.equal(s.calls.filter(c=>c.method==='DELETE').length,1);
  assert.equal(nodes(screen.tree).find(n=>n.type==='FlatList').props.data.length,0);
  assert.ok(texts(screen.tree).includes(s.t('moderation.emptyBlocks')));
  s.dispose();
});

test('late unblock response after leaving and returning refreshes data without an old-visit alert',async()=>{
  const s=await app();let release;
  const row={blockedUserId:2,nickname:'writer',avatarUrl:null,createdAt:'2026-10-10'};
  s.setHandler(call=>call.method==='DELETE'?new Promise(resolve=>{release=resolve;}):response({items:[row],nextCursor:null}));
  const screen=component(s,files[3]);await s.settle();
  const list=nodes(screen.tree).find(n=>n.type==='FlatList');
  click(button({tree:list.props.renderItem({item:row})},s.t('moderation.unblockUser',{nickname:'writer'})));
  s.alerts.at(-1)[2][1].onPress();await s.settle();
  s.focuses[0].cleanup();s.focuses[0].fn();await s.settle();
  release(response(null,204));await s.settle();
  assert.equal(s.alerts.length,1);assert.equal(s.state.moderationRevision(),1);
  assert.equal(s.calls.filter(call=>call.method==='DELETE').length,1);
  s.dispose();
});

test('feed and popup reviews refresh on block/unblock, preserve independent ratings/counts and block stale page completion', async () => {
  const s=await app();let blocked=false;
  s.setHandler(call=>response({items:blocked?[]:[call.url.includes('/feed')?s.post:s.review],nextCursor:blocked?null:'page2'}));
  const feed=component(s,'src/screens/CommunityScreen.tsx');
  const reviews=component(s,'src/components/place/PopupReviews.tsx',{publicId:'popup',title:'popup'});
  await s.settle(); assert.equal(s.calls.length,2);
  const old=s.review;
  let release;
  s.setHandler(call=>new URL(call.url).searchParams.has('cursor')?new Promise(resolve=>{release=resolve;}):response({items:[],nextCursor:null}));
  click(button(reviews,s.t('place.detail.reviews.more')));await s.settle();
  s.state.publishBlockChange(2,true,0);await s.settle();
  release(response({items:[old],nextCursor:null}));await s.settle();
  assert.equal(nodes(feed.tree).find(n=>n.type==='FlatList').props.data.length,0);
  assert.equal(nodes(reviews.tree).some(n=>n.type==='Card'),false);
  assert.equal(old.rating,4);assert.equal(old.commentCount,2);
  s.setHandler(()=>response({items:[old],nextCursor:null}));
  s.state.publishBlockChange(2,false,0);await s.settle();
  assert.equal(nodes(reviews.tree).filter(n=>n.type==='Card').length,1);
  s.dispose();
});

for(const [file,type] of [['src/app/community/[id].tsx','POST'],['src/app/reviews/[id].tsx','REVIEW']]) {
  test(`${type} detail connects its author menu and refreshes to missing on block without navigation or old content`, async()=>{
    const s=await app();
    const screen=component(s,file);await s.settle();
    const menu=nodes(screen.tree).find(n=>n.type?.name==='ModerationActions');
    assert.equal(menu.props.targetType,type);assert.equal(menu.props.targetId,10);assert.equal(menu.props.authorId,2);
    s.setHandler(()=>response({},404));s.state.publishBlockChange(2,true,0);await s.settle();
    assert.equal(nodes(screen.tree).some(n=>n.type?.name==='ModerationActions'),false);
    assert.equal(nodes(screen.tree).some(n=>n.type?.name==='CommunityComments'),false);
    assert.ok(!texts(screen.tree).includes('post body'));assert.equal(s.routes.length,0);
    assert.equal(s.calls.length,2);
    s.dispose();
  });
}
