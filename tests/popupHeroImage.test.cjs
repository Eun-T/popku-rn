const assert = require('node:assert/strict');
const { test } = require('node:test');
const { runtime } = require('./helpers/i18nRuntime.cjs');

function hero(uri, topInset = 0) {
  const ui = runtime({
    'expo-image': { Image: 'ExpoImage' },
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', StyleSheet: { create: styles => styles } },
    'assets/images/ranking-placeholder.png': 'local-placeholder',
  });
  const Hero = ui.load('src/components/place/PopupHeroImage.tsx').default;
  const root = ui.mount(() => Hero({ uri, accessibilityLabel: 'Popup poster', topInset }));
  return () => root.tree;
}

function assertBlurBackground(background) {
  assert.equal(background.type, 'ExpoImage');
  assert.equal(background.props.contentFit, 'cover');
  assert.equal(background.props.cachePolicy, 'memory-disk');
  assert.equal(background.props.blurRadius, 20);
  assert.equal(background.props.style.opacity, 0.55);
  assert.equal(background.props.style.transform[0].scale, 1.12);
  assert.equal(background.props.accessible, false);
  assert.equal(background.props.importantForAccessibility, 'no-hide-descendants');
}

test('rounding follows the actual contained poster bounds for every aspect ratio', () => {
  for (const [width, height] of [[600, 1200], [800, 800], [1200, 600]]) {
    const render = hero('https://example.com/poster.png', 44);
    const initial = render();
    initial.props.onLayout({ nativeEvent: { layout: { width: 390, height: 500 } } });
    initial.props.children[2].props.onLoad({ source: { width, height } });
    const tree = render();
    const style = Object.assign({}, ...tree.props.children[2].props.style);
    const scale = Math.min(358 / width, 424 / height);
    assert.equal(style.width, width * scale);
    assert.equal(style.height, height * scale);
    assert.equal(style.left, 16 + (358 - width * scale) / 2);
    assert.equal(style.top, 60 + (424 - height * scale) / 2);
    assert.equal(style.borderRadius, 12);
    assert.equal(style.overflow, 'hidden');
    assert.equal(style.opacity, undefined);
    assert.deepEqual(tree.props.children[0].props.style, initial.props.children[0].props.style);
  }
});

test('all poster ratios keep contain foreground and use the restored blurred cover background', () => {
  for (const shape of ['portrait', 'square', 'landscape']) {
    const uri = `https://example.com/${shape}.png`;
    const tree = hero(uri)();
    const [background, dim, poster] = tree.props.children;
    assert.equal(tree.props.pointerEvents, 'box-none', 'hero controls and retry remain touchable');
    assert.equal(tree.props.style.overflow, 'hidden');
    assert.equal(tree.props.style.backgroundColor, '#111111');
    assertBlurBackground(background);
    assert.equal(dim.type, 'View');
    assert.equal(dim.props.style.backgroundColor, '#000000');
    assert.equal(dim.props.style.opacity, 0.15);
    assert.equal(tree.props.children.filter(node => node.type === 'ExpoImage').length, 2);
    assert.equal(poster.props.contentFit, 'contain');
    assert.equal(poster.props.pointerEvents, 'none');
    assert.deepEqual(Object.assign({}, ...poster.props.style), { position: 'absolute', borderRadius: 12, overflow: 'hidden', top: 16, bottom: 16, left: 16, right: 16 });
    assert.equal(poster.props.accessibilityLabel, 'Popup poster');
    assert.equal(poster.props.source.uri, uri);
    assert.equal(background.props.source, poster.props.source);
    assert.equal(poster.props.blurRadius, undefined);
    assert.equal(poster.props.style.some(style => style.opacity !== undefined || style.backgroundColor !== undefined), false);
    poster.props.onLoad();
    assert.equal(tree.props.style.height, undefined, 'intrinsic dimensions never resize the viewport');
  }
});

test('foreground excludes iOS/Android top insets while background still fills the entire hero; Web zero inset preserves layout', () => {
  for (const topInset of [0, 24, 44, 59]) {
    for (const uri of ['https://example.com/poster.png', null]) {
      const render = hero(uri, topInset);
      const tree = render();
      const [background, dim, poster] = tree.props.children;
      const style = Object.assign({}, ...poster.props.style);
      assert.equal(tree.props.style.top, 0);
      assert.equal(tree.props.style.bottom, 0);
      assert.equal(tree.props.style.height, undefined, 'parent viewport size is unchanged');
      assert.equal(style.top, topInset + 16);
      assert.ok(style.top >= topInset, 'foreground starts outside status bar area');
      assert.equal(style.bottom, 16);
      assert.equal(style.left, 16);
      assert.equal(style.right, 16);
      assert.equal(poster.props.contentFit, 'contain');
      if (background) assert.equal(background.props.style.top, 0);
      poster.props.onError();
      // Error fallback uses the same safe foreground rectangle.
      assert.equal(Object.assign({}, ...render().props.children[2].props.style).top, topInset + 16);
    }
  }
});

test('missing URL uses local placeholder without a background or network image source', () => {
  for (const uri of [null, '']) {
    const [background, dim, poster] = hero(uri)().props.children;
    assert.ok(!background);
    assert.ok(!dim);
    assert.equal(poster.props.source, 'local-placeholder');
    assert.equal(poster.props.contentFit, 'contain');
  }
});

test('image failure falls back locally without changing geometry; a new keyed image starts clean', () => {
  const render = hero('https://example.com/broken.png');
  const initial = render();
  initial.props.children[2].props.onError();
  const fallback = render();
  assert.equal(fallback.props.children[0], false);
  assert.equal(fallback.props.children[1], false);
  assert.equal(fallback.props.children[2].props.source, 'local-placeholder');
  assert.deepEqual(fallback.props.style, initial.props.style);
  assert.deepEqual(fallback.props.children[2].props.style, initial.props.children[2].props.style);
  const next = hero('https://example.com/next.png')();
  assert.equal(next.props.children[2].props.source.uri, 'https://example.com/next.png');
});
