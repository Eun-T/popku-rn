const assert = require('node:assert/strict');
const { test } = require('node:test');
const { app, files } = require('./helpers/profileI18nRuntime.cjs');
const { nodes } = require('./helpers/i18nRuntime.cjs');
const { compilerTransform } = require('./helpers/reactCompiler.cjs');
const email = 'popchive.support@gmail.com';
const row = (s, root, key) => nodes(root.tree).find(n => n.type?.name === 'MenuRow' && n.props.label === s.t(key));

for (const compiled of [false, true]) for (const guest of [true, false]) {
  test(`${compiled ? 'Compiler' : 'Hook'} ${guest ? 'guest' : 'member'}: public email row translates and opens mailto without auth or navigation`, async () => {
    const urls = [];
    const s = await app({ guest, transform: compiled ? compilerTransform([files[0], 'src/hooks/useTranslation.ts']) : undefined,
      openMail: async url => { urls.push(url); } });
    try {
      const Screen = s.load(files[0]).default, root = s.mount(() => Screen());
      const slots = root.slots, user = s.user(), calls = s.calls.slice();
      for (const language of ['ko', 'ja', 'ko', 'system']) {
        await s.language(language);
        const menu = row(s, root, 'profile.emailInquiry');
        assert.equal(menu.props.label, language === 'ko' ? '메일문의' : 'メール相談');
        assert.equal(menu.props.icon, undefined); assert.equal(menu.props.divider, undefined);
        assert.equal(menu.props.showChevron, false);
        const rendered = s.mount(() => menu.type(menu.props)).tree;
        assert.equal(rendered.props.disabled, false);
        const existing = row(s, root, 'profile.inquiries');
        assert.equal(rendered.props.style[0], s.mount(() => existing.type(existing.props)).tree.props.style[0]);
        assert.equal(nodes(rendered).some(n => n.type === 'Mail' || n.type === 'ChevronRight'), false);
        assert.equal(rendered.props.style[1], false);
        const cell = nodes(root.tree).find(n => n.type === 'View' && n.props.children === menu);
        assert.equal(cell.props.style.width, '50%');
        const grid = nodes(root.tree).find(n => n.type === 'View' && n.props.children === cell);
        assert.deepEqual(grid.props.style, { flexDirection: 'row' });
        const service = nodes(root.tree).find(n => n.type === 'View' && Array.isArray(n.props.children) && n.props.children.includes(grid));
        assert.deepEqual(nodes(service).filter(n => n.type?.name === 'MenuRow').map(n => n.props.label),
          ['profile.notices', 'language.settings', 'profile.inquiries', 'profile.policies', 'profile.emailInquiry'].map(key => s.t(key)));
        assert.equal(root.slots, slots); assert.equal(s.user(), user); assert.deepEqual(s.calls, calls);
        assert.deepEqual(urls, []);
      }
      await s.system('ko-KR'); assert.equal(row(s, root, 'profile.emailInquiry').props.label, '메일문의');
      row(s, root, 'profile.emailInquiry').props.onPress(); await s.settle();
      assert.deepEqual(urls, ['mailto:' + email]); assert.deepEqual(s.alerts, []);
      assert.deepEqual(s.routes, []); assert.deepEqual(s.calls, calls);
      row(s, root, 'profile.inquiries').props.onPress(); assert.deepEqual(s.routes, ['/profile/inquiries']);
    } finally { s.dispose(); }
  });
}

for (const copyResult of ['success', 'false', 'reject']) test(`mail failure offers email copy: ${copyResult}`, async () => {
  const copied = [];
  let rejectMail;
  const s = await app({ guest: true, openMail: () => new Promise((_, reject) => { rejectMail = reject; }),
    copyEmail: async value => { copied.push(value); if (copyResult === 'reject') throw Error('clipboard unavailable'); return copyResult !== 'false'; } });
  try {
    const Screen = s.load(files[0]).default, root = s.mount(() => Screen());
    row(s, root, 'profile.emailInquiry').props.onPress();
    await s.language('ja'); rejectMail(Error('no email app')); await s.settle();
    const [title, message, actions] = s.alerts[0];
    assert.equal(title, 'メール相談'); assert.ok(message.includes(email));
    assert.equal(actions[0].style, 'cancel'); assert.equal(actions[0].text, 'キャンセル');
    assert.equal(actions[1].text, 'メールアドレスをコピー'); assert.deepEqual(copied, []);
    await s.language('ko'); actions[1].onPress(); await s.settle();
    assert.deepEqual(copied, [email]);
    assert.equal(s.alerts[1][0], s.t('profile.emailSupport.' + (copyResult === 'success' ? 'copied' : 'copyFailed')));
    assert.equal(s.alerts[1][1], email); assert.deepEqual(s.routes, []); assert.deepEqual(s.calls, []);
  } finally { s.dispose(); }
});
