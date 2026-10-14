const assert = require('node:assert/strict');
const { test } = require('node:test');
const { app, files, inputs, button } = require('./helpers/accountI18nRuntime.cjs');
const { nodes, texts } = require('./helpers/i18nRuntime.cjs');
const { compilerTransform } = require('./helpers/reactCompiler.cjs');

test('all Korean policies identify the service and contact and use the release effective date', async () => {
  const s = await app();
  try {
    const { policies } = s.load('src/content/policies.ts');
    for (const [id, policy] of Object.entries(policies)) {
      const content = JSON.stringify(policy);
      for (const value of ['팝카이브', '김은태', 'popchive.support@gmail.com']) assert.ok(content.includes(value));
      assert.ok(!content.includes('POPKU'));
      assert.equal(policy.effectiveDate, '시행일: 2026년 10월 14일');
      assert.equal(policy.sections.at(-1).title, '부칙');
      assert.ok(JSON.stringify(policy.sections.at(-1)).includes('2026년 10월 14일부터 시행합니다.'));
      assert.doesNotMatch(content, /추후 확정|\[서비스명\]|\[운영자명\]|YYYY/);
    }
  } finally { s.dispose(); }
});

for (const compiled of [false, true]) test(`${compiled ? 'React Compiler' : 'Hook'}: signup policy buttons push public details and retain mixed consents on return`, async () => {
  const detailFile = 'src/components/profile/PolicyDetailScreen.tsx';
  const s = await app(compiled ? compilerTransform([files[1], detailFile, 'src/hooks/useTranslation.ts']) : undefined);
  try {
    const Screen = s.load(files[1]).default;
    const root = s.mount(() => Screen());
    inputs(root)[0].props.onChangeText('raw@example.test');
    button(s, root, '인증번호 받기').props.onPress();
    await s.settle();
    inputs(root)[1].props.onChangeText('123456');
    button(s, root, '인증하기').props.onPress();
    await s.settle();
    inputs(root)[2].props.onChangeText('Password123');
    inputs(root)[3].props.onChangeText('Password123');
    button(s, root, '다음').props.onPress();
    inputs(root)[0].props.onChangeText('tester');
    await button(s, root, '다음').props.onPress();
    await s.settle();
    const rows = () => nodes(root.tree).filter(n => n.type?.name === 'ConsentRow');
    assert.equal(rows().length, 2);
    rows()[0].props.onToggle();
    const slots = root.slots, calls = s.calls.slice();
    for (const [index, key] of [[0, 'terms'], [1, 'privacy']]) {
      // Invoke the actual details Pressable, independently of its checkbox.
      const row = s.mount(() => rows()[index].type(rows()[index].props));
      nodes(row.tree).find(n => n.props?.accessibilityRole === 'button').props.onPress();
      assert.equal(s.routes.at(-1), `/profile/policies/${key}`);
      const Route = s.load(`src/app/profile/policies/${key}.tsx`).default;
      const element = Route();
      const detail = s.mount(() => element.type(element.props));
      for (const language of ['ja', 'ko', 'system']) {
        await s.language(language);
        assert.ok(texts(detail.tree).includes('popchive.support@gmail.com'));
        assert.ok(texts(root.tree).includes(s.text('약관에 동의해 주세요')));
        assert.deepEqual(rows().map(n => n.props.checked), [true, false]);
      }
      await s.system('ko-KR');
      nodes(detail.tree).find(n => n.type === 'Pressable').props.onPress();
      assert.equal(s.routes.at(-1), 'back');
      root.render();
      assert.equal(root.slots, slots);
      assert.deepEqual(rows().map(n => n.props.checked), [true, false]);
      assert.equal(button(s, root, '가입하기').props.disabled, true);
      assert.deepEqual(s.calls, calls);
    }
    rows()[1].props.onToggle();
    assert.equal(button(s, root, '가입하기').props.disabled, true);
    button(s, root, '[필수] 만 14세 이상입니다.').props.onPress();
    assert.equal(button(s, root, '가입하기').props.disabled, false);
  } finally { s.dispose(); }
});
