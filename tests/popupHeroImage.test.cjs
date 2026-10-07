const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const ts = require('typescript');

function hero(uri, topInset = 0) {
  let failed = false;
  const jsx = (type, props) => ({ type, props });
  const mocks = {
    react: { useState: () => [failed, value => { failed = value; }] },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { Image: 'Image', View: 'View', StyleSheet: { create: styles => styles } },
    '../../theme/tokens': { colors: { background: '#FFFFFF' }, spacing: { space16: 16 } },
    '../../../assets/images/ranking-placeholder.png': 'local-placeholder',
  };
  const source = readFileSync('src/components/place/PopupHeroImage.tsx', 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'exports', code)(name => {
    assert.ok(name in mocks, `Unexpected dependency: ${name}`);
    return mocks[name];
  }, module.exports);
  return () => module.exports.default({ uri, accessibilityLabel: 'Popup poster', topInset });
}

function assertBlurBackground(background) {
  assert.equal(background.type, 'Image');
  assert.equal(background.props.resizeMode, 'cover');
  assert.equal(background.props.blurRadius, 20);
  assert.equal(background.props.style.opacity, 0.4);
  assert.equal(background.props.style.transform[0].scale, 1.12);
  assert.equal(background.props.accessible, false);
  assert.equal(background.props.importantForAccessibility, 'no-hide-descendants');
}

test('all poster ratios keep contain foreground and use the restored blurred cover background', () => {
  for (const shape of ['portrait', 'square', 'landscape']) {
    const uri = `https://example.com/${shape}.png`;
    const tree = hero(uri)();
    const [background, poster] = tree.props.children;
    assert.equal(tree.props.pointerEvents, 'none', 'hero buttons remain touchable');
    assert.equal(tree.props.style.overflow, 'hidden');
    assertBlurBackground(background);
    assert.equal(tree.props.children.filter(node => node.type === 'Image').length, 2);
    assert.equal(poster.props.resizeMode, 'contain');
    assert.deepEqual(Object.assign({}, ...poster.props.style), { position: 'absolute', top: 16, bottom: 16, left: 16, right: 16 });
    assert.equal(poster.props.accessibilityLabel, 'Popup poster');
    assert.equal(poster.props.source.uri, uri);
    assert.equal(background.props.source, poster.props.source);
    assert.equal(poster.props.blurRadius, undefined);
    assert.equal(poster.props.onLoad, undefined, 'intrinsic dimensions never resize the viewport');
  }
});

test('foreground excludes iOS/Android top insets while background still fills the entire hero; Web zero inset preserves layout', () => {
  for (const topInset of [0, 24, 44, 59]) {
    for (const uri of ['https://example.com/poster.png', null]) {
      const render = hero(uri, topInset);
      const tree = render();
      const [background, poster] = tree.props.children;
      const style = Object.assign({}, ...poster.props.style);
      assert.equal(tree.props.style.top, 0);
      assert.equal(tree.props.style.bottom, 0);
      assert.equal(tree.props.style.height, undefined, 'parent viewport size is unchanged');
      assert.equal(style.top, topInset + 16);
      assert.ok(style.top >= topInset, 'foreground starts outside status bar area');
      assert.equal(style.bottom, 16);
      assert.equal(style.left, 16);
      assert.equal(style.right, 16);
      assert.equal(poster.props.resizeMode, 'contain');
      if (background) assert.equal(background.props.style.top, 0);
      poster.props.onError();
      // Error fallback uses the same safe foreground rectangle.
      assert.equal(Object.assign({}, ...render().props.children[1].props.style).top, topInset + 16);
    }
  }
});

test('missing URL uses local placeholder without a background or network image source', () => {
  for (const uri of [null, '']) {
    const [background, poster] = hero(uri)().props.children;
    assert.ok(!background);
    assert.equal(poster.props.source, 'local-placeholder');
    assert.equal(poster.props.resizeMode, 'contain');
  }
});

test('image failure falls back locally without changing geometry; a new keyed image starts clean', () => {
  const render = hero('https://example.com/broken.png');
  const initial = render();
  initial.props.children[1].props.onError();
  const fallback = render();
  assert.equal(fallback.props.children[0], false);
  assert.equal(fallback.props.children[1].props.source, 'local-placeholder');
  assert.deepEqual(fallback.props.style, initial.props.style);
  assert.deepEqual(fallback.props.children[1].props.style, initial.props.children[1].props.style);
  const next = hero('https://example.com/next.png')();
  assert.equal(next.props.children[1].props.source.uri, 'https://example.com/next.png');
});
