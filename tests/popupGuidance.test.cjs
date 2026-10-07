const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync('src/lib/popupGuidance.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const mod = { exports: {} }; new Function('exports', code)(mod.exports);
const { popupGuidanceItems: items, guidancePage, guidanceIdentity } = mod.exports;
test('notice/benefits presence, order, pagination and original localized text', () => {
  const cases = [['notice', 'benefits', ['notice', 'benefits']], ['notice', null, ['notice']], [undefined, 'benefits', ['benefits']], [null, undefined, []], [' \n ', 'benefits', ['benefits']], ['notice', ' \t ', ['notice']], ['', '', []]];
  for (const [notice, benefits, expected] of cases) {
    const result = items(notice, benefits);
    assert.deepEqual(result.map(item => item.kind), expected);
    assert.equal(result.length > 1, expected.length === 2);
  }
  assert.equal(items(' 原文 ', null)[0].text, ' 原文 ');
  for (const locale of ['ko', 'ja']) {
    const detail = require('../src/locales/' + locale + '.json').place.detail;
    for (const item of items('a', 'b')) assert.ok(detail[item.kind]);
  }
  assert.equal(require('../src/locales/ko.json').place.detail.notice, '공지사항');
  assert.equal(require('../src/locales/ko.json').place.detail.benefits, '혜택');
});
test('paging uses real narrow container width and clamps overscroll', () => {
  assert.equal(guidancePage(288, 288, 2), 1);
  assert.equal(guidancePage(-20, 288, 2), 0);
  assert.equal(guidancePage(600, 288, 2), 1);
  assert.equal(guidancePage(20, 0, 2), 0);
});
test('measurement/page identity resets for popup, language and exact content changes', () => {
  const base = guidanceIdentity('a', 'ko', items('n', 'b'));
  for (const next of [guidanceIdentity('b', 'ko', items('n', 'b')), guidanceIdentity('a', 'ja', items('n', 'b')), guidanceIdentity('a', 'ko', items('new', 'b')), guidanceIdentity('a', 'ko', items('n', null))]) assert.notEqual(next, base);
});

test('measured pager keeps common box height while swiping and resets on width changes', () => {
  let cursor = 0;
  const slots = [];
  const jsx = (type, props, key) => ({ type, props, key });
  const mocks = {
    react: { useState(value) { const i = cursor++; if (!(i in slots)) slots[i] = value; return [slots[i], next => { slots[i] = next; }]; } },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { ScrollView: 'ScrollView', Text: 'Text', View: 'View', StyleSheet: { create: value => value }, useWindowDimensions: () => ({ fontScale: 1 }) },
    '../../lib/popupGuidance': mod.exports,
    '../../locales': { t: key => key },
    '../../theme/tokens': { colors: {}, radius: {}, spacing: {} },
  };
  const source = ts.transpileModule(fs.readFileSync('src/components/place/PopupGuidanceCarousel.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const component = { exports: {} };
  new Function('require', 'exports', source)(name => mocks[name], component.exports);
  const root = component.exports.default({ popupId: 'a', languageCode: 'ko', notice: 'short', benefits: 'long' });
  const pager = root.props.children;
  cursor = 0;
  const outer = pager.type(pager.props);
  const measured = outer.props.children;
  outer.props.onLayout({ nativeEvent: { layout: { width: 288 } } });
  cursor = 0;
  const resized = pager.type(pager.props).props.children;
  assert.notEqual(resized.key, measured.key, 'width remounts measurement and current page');
  const render = () => { cursor = 1; return resized.type(resized.props); };
  let tree = render();
  const viewport = tree;
  const row = viewport.props.children[0];
  assert.equal(row.props.style[0].width, '200%');
  assert.equal(row.props.style[0].alignItems, 'stretch');
  assert.equal(row.props.pointerEvents, 'none');
  assert.equal(row.props.importantForAccessibility, 'no-hide-descendants');
  row.props.onLayout({ nativeEvent: { layout: { height: 130 } } });
  tree = render();
  let scroll = tree.props.children[1];
  assert.equal(scroll.props.style[1].height, 130);
  assert.equal(scroll.props.snapToInterval, 288);
  assert.ok(scroll.props.pagingEnabled);
  for (const page of scroll.props.children) assert.equal(page.props.style.height, 130);
  const assertPagination = (page, expected) => {
    const card = page.props.children;
    const rendered = card.type(card.props);
    const heading = rendered.props.children[0];
    const pagination = heading.props.children[2];
    assert.equal(pagination.props.children.join(''), expected);
    assert.equal(pagination.props.style.fontSize, 12);
    assert.equal(pagination.props.style.fontWeight, '400');
    assert.equal(pagination.props.style.lineHeight, heading.props.children[1].props.style.lineHeight);
    assert.equal(pagination.props.style.textAlign, 'right');
  };
  assertPagination(scroll.props.children[0], '1/2');
  assertPagination(scroll.props.children[1], '2/2');
  assert.equal(tree.props.children.length, 2, 'only measurement and pager; no dot footer or spacing');
  scroll.props.onScroll({ nativeEvent: { contentOffset: { x: 288 } } });
  tree = render();
  scroll = tree.props.children[1];
  assert.equal(scroll.props.style[1].height, 130, 'swipe does not change viewport height');
  assert.equal(scroll.props.children[1].props.accessibilityElementsHidden, false);
  assertPagination(scroll.props.children[1], '2/2');
  for (const values of [{ notice: 'one' }, { benefits: 'one' }]) {
    const single = component.exports.default({ popupId: 'a', languageCode: 'ko', ...values });
    assert.equal(single.props.children.type.name, 'GuidanceCard');
    const card = single.props.children;
    assert.equal(card.type(card.props).props.children[0].props.children[2], false, 'single card has no 1/1');
  }
  assert.equal(component.exports.default({ popupId: 'a', languageCode: 'ko' }), null);
});
