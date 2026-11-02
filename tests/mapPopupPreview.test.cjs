const assert = require('node:assert/strict');
const { test } = require('node:test');
const { runtime, nodes, texts, flush } = require('./helpers/i18nRuntime.cjs');
const { compilerTransform } = require('./helpers/reactCompiler.cjs');
const file = 'src/components/map/MapPopupPreviewCard.tsx';
const popups = Object.freeze(Array.from({ length: 10 }, (_, i) => Object.freeze({
  id: `popup-${i}`, name: `原文 팝업 ${i}`, coverImageUrl: `https://images.test/${i}`,
  tags: [{ id: 5, name: '뷰티' }], startDate: '2099-01-01', endDate: '2099-01-03',
})));

async function app(count, options = {}) {
  const opened = [], requests = [];
  const ui = runtime({
    'react-native': { ...Object.fromEntries(['View', 'Text', 'FlatList', 'Image', 'Pressable'].map(n => [n, n])),
      StyleSheet: { create: value => value } },
    'src/components/common/Tag.tsx': { __esModule: true, default: 'Tag' },
    'src/lib/popups.ts': { getPopupDetail: async (id, signal, unused, language) => {
      if (options.detail) return options.detail(id, signal, language, requests);
      requests.push({ id, language }); return { address: options.address ?? (language === 'ja' ? '東京都\n3階\n長い住所' : '서울시\n3층\n긴 주소') };
    } },
  }, { transform: compilerTransform([file, 'src/hooks/useTranslation.ts']) });
  const store = ui.load('src/locales/languageStore.ts').languageStore;
  await store.initialize({ read: async () => 'ko', write: async () => {}, getLanguageTags: () => ['ja-JP'] });
  const { default: Preview } = ui.load(file);
  let data = popups.slice(0, count), width = options.width ?? 390;
  const bottomInset = options.bottomInset ?? 28;
  const root = ui.mount(() => Preview({ popups: data, bottomInset, maxHeight: options.maxHeight ?? 696, width, onPopupPress: id => opened.push(id) }));
  let pager = ui.mount(() => root.tree.type(root.tree.props));
  const list = () => nodes(pager.tree).find(n => n.type === 'FlatList');
  const offset = page => {
    const props = list().props;
    if (page < 0 || page >= props.data.length) return page * width;
    return props.snapToOffsets[page];
  };
  const scroll = page => list().props.onScroll({ nativeEvent: { contentOffset: { x: offset(page) } } });
  const touch = (x = 200, y = 100) => pager.tree.props.onTouchStart({ nativeEvent: { pageX: x, pageY: y } });
  await flush();
  return { ...ui, root, list, opened, requests, touch, scroll,
    get pager() { return pager; },
    height: () => pager.tree.props.style[1].height,
    page: () => list().props.data.findIndex((item, index) => !list().props.renderItem({ item, index }).props.accessibilityElementsHidden),
    mountCard(index) {
      return ui.mount(() => {
        const row = list().props.renderItem({ item: list().props.data[index], index });
        const card = row.props.children;
        return card.type(card.props);
      });
    },
    mountSingle() { return ui.mount(() => Preview({ popup: popups[0], bottomInset, onPress: () => opened.push(popups[0].id) })); },
    swipeTo(page) {
      touch(); list().props.onScrollBeginDrag(); scroll(page);
      list().props.onScrollEndDrag({ nativeEvent: { contentOffset: { x: offset(page) }, velocity: { x: 1 } } });
      list().props.onMomentumScrollBegin();
      list().props.onMomentumScrollEnd({ nativeEvent: { contentOffset: { x: offset(page) } } });
    },
    update(next, nextWidth = width) {
      const key = root.tree?.key;
      data = next; width = nextWidth; root.render();
      if (root.tree?.key !== key) pager = root.tree ? ui.mount(() => root.tree.type(root.tree.props)) : null;
      else pager?.render();
    },
    async language(value) { await store.setLanguagePreference(value); await flush(); ui.renderAll(); },
  };
}

for (const bottomInset of [0, 20, 34, 44]) {
  test(`cluster reuses the ordinary card height and padding with bottom inset ${bottomInset}`, async () => {
    const s = await app(2, { bottomInset, address: '서울시' });
    try {
      const single = s.mountSingle(); await flush();
      const baseStyle = single.tree.props.style[0], padding = single.tree.props.style[1].paddingBottom;
      const image = nodes(single.tree).find(n => n.type === 'Image');
      const singleImageLedHeight = image.props.style.height + baseStyle.paddingTop + baseStyle.borderTopWidth + padding;
      assert.equal(s.height(), singleImageLedHeight);
      assert.equal(baseStyle.height, undefined); assert.equal(baseStyle.minHeight, undefined);
      assert.equal(single.tree.props.children[1].props.style.maxHeight, undefined);
      const address = nodes(single.tree).find(n => n.type === 'Text' && n.props.children === '서울시');
      assert.equal(address.props.numberOfLines, undefined);
      const period = nodes(single.tree).find(n => n.type === 'Text' && n.props.numberOfLines === 1);
      assert.equal(period.props.style.paddingRight, undefined);
      s.swipeTo(1); assert.equal(s.height(), singleImageLedHeight);
    } finally { s.dispose(); }
  });
}

for (const count of [1, 2, 3, 10]) {
  test(`${count} cluster popups retain one-card height with no pagination header`, async () => {
    const s = await app(count);
    try {
      assert.equal(s.root.tree.type.name, 'MapPopupPreviewPager');
      assert.equal(s.list().props.horizontal, true); assert.equal(s.list().props.pagingEnabled, false);
      assert.equal(s.list().props.decelerationRate, 'fast'); assert.equal(s.list().props.disableIntervalMomentum, true);
      assert.equal(s.list().props.scrollEnabled, count > 1); assert.equal(s.list().props.directionalLockEnabled, true);
      assert.equal(s.list().props.initialNumToRender, count > 1 ? 2 : 1); assert.equal(s.list().props.showsHorizontalScrollIndicator, false);
      assert.equal(s.list().props.bounces, false); assert.equal(s.list().props.overScrollMode, 'never');
      assert.equal(s.height(), 181, 'the original image-led single-card height, independent of popup count');
      assert.equal(s.requests.length, count, 'addresses are prepared once per selection, without preloading every image');
      assert.equal(s.pager.tree.props.onLayout, undefined);
      assert.equal(s.pager.tree.props.children, s.list(), 'the pager has no badge, header or extra vertical space');
      assert.equal(texts(s.pager.tree), '');
      const cardWidth = count > 1 ? (390 - 12) / (1 + 0.14) : 390, stride = cardWidth + (count > 1 ? 12 : 0);
      assert.deepEqual(s.list().props.snapToOffsets, Array.from({ length: count }, (_, index) => index * stride));
      assert.equal(s.list().props.snapToAlignment, 'start');
      assert.equal(s.list().props.snapToInterval, undefined);
      assert.equal(s.list().props.removeClippedSubviews, false);
      assert.deepEqual(s.list().props.contentContainerStyle, { paddingRight: 390 - cardWidth });
      assert.equal(s.list().props.ItemSeparatorComponent().props.style.width, count > 1 ? 12 : 0);
      const pageHeight = 181;
      for (let index = 0; index < count; index++) {
        s.swipeTo(index); assert.equal(s.height(), 181);
        assert.equal(s.page(), index);
        const row = s.list().props.renderItem({ item: s.list().props.data[index], index });
        assert.deepEqual(row.props.style, { width: cardWidth, height: pageHeight });
        assert.equal(row.props.onLayout, undefined, 'page changes never measure card heights');
        assert.deepEqual(s.list().props.getItemLayout(null, index), { length: cardWidth, offset: stride * index, index });
      }
      const last = s.mountCard(count - 1); await flush();
      assert.equal(last.tree.type, 'Pressable'); assert.equal(last.tree.props.style[1].paddingBottom, 36);
      assert.deepEqual(last.tree.props.style[2], { height: pageHeight });
      assert.equal(last.tree.props.style.length, 3, 'the original card padding and border are restored');
      assert.equal(last.tree.props.children[1].props.style[1].maxHeight, 128);
      const poster = nodes(last.tree).find(n => n.type === 'Image');
      assert.deepEqual([poster.props.style.width, poster.props.style.height], [96, 128]);
      const address = nodes(last.tree).find(n => n.type === 'Text' && typeof n.props.children === 'string' && n.props.children.startsWith('서울시'));
      assert.equal(address.props.numberOfLines, 2); assert.equal(address.props.ellipsizeMode, 'tail');
      const period = nodes(last.tree).find(n => n.type === 'Text' && n.props.numberOfLines === 1);
      assert.equal(period.props.style.paddingRight, undefined, 'the counter no longer needs to reserve space over the period');
      s.touch(); last.tree.props.onPress(); assert.deepEqual(s.opened, [popups[count - 1].id]);
      assert.equal(s.requests.length, count, 'mounting cards or swiping adds no API requests');
    } finally { s.dispose(); }
  });
}

test('dragging, release and momentum cannot navigate; a fresh tap opens only the current page', async () => {
  const s = await app(3);
  try {
    const first = s.mountCard(0), second = s.mountCard(1);
    s.touch(); s.list().props.onScrollBeginDrag(); s.scroll(1);
    first.tree.props.onPress(); second.tree.props.onPress(); assert.deepEqual(s.opened, []);
    s.list().props.onScrollEndDrag({ nativeEvent: { contentOffset: { x: 390 }, velocity: { x: 1 } } });
    s.list().props.onMomentumScrollBegin(); s.touch(); second.tree.props.onPress(); assert.deepEqual(s.opened, []);
    s.list().props.onMomentumScrollEnd({ nativeEvent: { contentOffset: { x: 390 } } });
    second.tree.props.onPress(); assert.deepEqual(s.opened, [], 'late press from the drag remains blocked');
    s.touch(); first.tree.props.onPress(); second.tree.props.onPress();
    assert.deepEqual(s.opened, ['popup-1']); assert.equal(s.page(), 1);
  } finally { s.dispose(); }
});

for (const width of [320, 375, 390, 430]) {
  for (const count of [2, 3, 10]) {
    test(`${width}dp viewport, ${count} cards: weekly-carousel snapping and identical alignment on every page`, async () => {
      const s = await app(count, { width });
      try {
        const list = s.list().props;
        const first = list.getItemLayout(null, 0), second = list.getItemLayout(null, 1);
        const last = list.getItemLayout(null, count - 1), previous = list.getItemLayout(null, count - 2);
        const expectedWidth = (width - 12) / 1.14;
        const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
        closeTo(first.length, expectedWidth);
        closeTo(second.offset - first.length, 12);
        closeTo(width - second.offset, expectedWidth * 0.14);
        assert.equal(first.offset, 0);
        const end = last.offset + last.length + list.contentContainerStyle.paddingRight - width;
        closeTo(end, list.snapToOffsets.at(-1));
        closeTo(last.offset - end, 0);
        closeTo(previous.offset + previous.length - end, -12);
        assert.ok(end > previous.offset);
        for (let index = 0; index < count; index++) {
          const layout = list.getItemLayout(null, index);
          closeTo(layout.offset - list.snapToOffsets[index], 0);
          s.swipeTo(index);
          assert.equal(s.page(), index);
          const card = s.mountCard(index);
          assert.equal(card.tree.props.style[0].paddingHorizontal, 16, 'the visible content starts at the same 16dp inset on every card');
          s.touch(); card.tree.props.onPress();
          assert.equal(s.opened.at(-1), popups[index].id);
        }
        await flush();
        assert.equal(s.requests.length, count, 'every address is requested once on selection; swipe and mounts do not refetch');
        assert.equal(s.height(), 181);
        assert.equal(s.pager.tree.props.style[0].overflow, 'hidden');
        assert.equal(s.list().props.initialNumToRender, 2, 'initial images are limited to the current and adjacent item');
      } finally { s.dispose(); }
    });
  }
}

test('vertical movement suppresses a tap without capturing the parent drag responder', async () => {
  const s = await app(2);
  try {
    const first = s.mountCard(0); s.touch(100, 100);
    s.pager.tree.props.onTouchMove({ nativeEvent: { pageX: 102, pageY: 125 } });
    first.tree.props.onPress(); assert.deepEqual(s.opened, []);
    assert.equal(s.pager.tree.props.onMoveShouldSetResponderCapture, undefined);
    assert.equal(s.pager.tree.props.onStartShouldSetResponder, undefined);
    s.touch(); first.tree.props.onPress(); assert.deepEqual(s.opened, ['popup-0']);
  } finally { s.dispose(); }
});

test('a real visible peek is tappable, while offscreen cards and drag presses are ignored', async () => {
  const s = await app(3);
  try {
    const second = s.mountCard(1), third = s.mountCard(2);
    s.touch(); third.tree.props.onPress(); assert.deepEqual(s.opened, []);
    s.touch(); second.tree.props.onPress(); assert.deepEqual(s.opened, ['popup-1']);
    s.touch(); s.list().props.onScrollBeginDrag(); second.tree.props.onPress();
    assert.deepEqual(s.opened, ['popup-1']);
    s.swipeTo(2); s.touch(); second.tree.props.onPress();
    assert.deepEqual(s.opened, ['popup-1'], 'the previous item is fully offscreen at the uniform final snap');
  } finally { s.dispose(); }
});

test('address preparation is limited to two requests and cancelled with the selection', async () => {
  const pending = [];
  const s = await app(10, { detail: (id, signal, language, requests) => {
    requests.push({ id, language, signal });
    return new Promise((resolve, reject) => pending.push({ resolve, reject }));
  } });
  try {
    assert.equal(s.requests.length, 2);
    s.swipeTo(9); s.mountCard(9); assert.equal(s.requests.length, 2);
    pending[0].reject(new Error('offline')); await flush();
    assert.equal(s.requests.length, 3, 'a failure falls back without retrying or blocking the queue');
    s.dispose();
    assert.ok(s.requests.every(request => request.signal.aborted));
    pending[1].resolve({ address: 'obsolete' }); pending[2].resolve({ address: 'obsolete' }); await flush();
    assert.equal(s.requests.length, 3, 'stale completions cannot start more requests');
  } finally { s.dispose(); }
});

test('rapid paging clamps both edges without looping or changing the viewport style', async () => {
  const s = await app(10);
  try {
    const style = structuredClone(s.pager.tree.props.style);
    for (const index of [1, 2, 7, 9, 8, 4, 0, 99, -5, 9]) {
      s.swipeTo(index); assert.equal(s.page(), Math.max(0, Math.min(9, index)));
      assert.deepEqual(s.pager.tree.props.style, style);
    }
  } finally { s.dispose(); }
});

for (const index of [0, 1, 9]) {
  test(`detail press on page ${index + 1} preserves pager identity, index and scroll configuration on parent rerender`, async () => {
    const s = await app(10);
    try {
      s.swipeTo(index);
      const pager = s.pager, key = s.root.tree.key;
      const layout = structuredClone(s.list().props.snapToOffsets), height = s.height();
      const requests = s.requests.length;
      const card = s.mountCard(index);
      s.touch(); card.tree.props.onPress();
      assert.deepEqual(s.opened, [popups[index].id]);
      // A retained map screen renders again as focus changes; its membership and width stay unchanged.
      s.update(popups.slice());
      assert.equal(s.pager, pager); assert.equal(s.root.tree.key, key);
      assert.equal(s.page(), index);
      assert.deepEqual(s.list().props.snapToOffsets, layout);
      assert.equal(s.list().props.initialScrollIndex, undefined);
      assert.equal(s.list().props.contentOffset, undefined, 'no prop forces the native list back to its first card');
      assert.equal(s.height(), height);
      await flush(); assert.equal(s.requests.length, requests);
    } finally { s.dispose(); }
  });
}

test('membership, width and cluster changes reset to page one; duplicate IDs cannot add pages', async () => {
  const s = await app(3);
  try {
    s.swipeTo(2); const previousKey = s.root.tree.key;
    s.update([popups[0], popups[1]]);
    assert.notEqual(s.root.tree.key, previousKey); assert.equal(s.page(), 0);
    s.swipeTo(1); s.update([popups[4], popups[5], popups[6]]); assert.equal(s.page(), 0);
    s.swipeTo(2); s.update([popups[4], popups[5], popups[6]], 320); assert.equal(s.page(), 0);
    s.update([popups[0], popups[0], popups[1]]);
    assert.deepEqual(s.list().props.data.map(p => p.id), ['popup-0', 'popup-1']); assert.equal(s.page(), 0);
    s.update([popups[0]]); assert.equal(s.page(), 0); assert.equal(s.list().props.scrollEnabled, false);
    s.update([]); assert.equal(s.root.tree, null);
  } finally { s.dispose(); }
});

test('small screens retain one card with horizontal paging and no vertical list', async () => {
  const s = await app(10, { width: 320, maxHeight: 260 });
  try {
    assert.equal(s.height(), 181);
    s.swipeTo(9); assert.equal(s.height(), 181); assert.equal(s.page(), 9);
    assert.equal(s.list().props.contentInsetAdjustmentBehavior, 'never'); assert.equal(s.list().props.nestedScrollEnabled, undefined);
  } finally { s.dispose(); }
});

test('compiled ko-ja-ko/system keeps the page and card height while translating the mounted card', async () => {
  const s = await app(3);
  try {
    s.swipeTo(1); const key = s.root.tree.key, height = s.height();
    const current = s.mountCard(1); await flush();
    for (const [preference, language] of [['ja', 'ja'], ['ko', 'ko'], ['system', 'ja']]) {
      await s.language(preference);
      assert.equal(s.page(), 1); assert.equal(s.root.tree.key, key); assert.equal(s.height(), height);
      assert.equal(s.list().props.extraData[0], language); assert.ok(texts(current.tree).includes(popups[1].name));
      assert.ok(texts(current.tree).includes(language === 'ja' ? '東京都' : '서울시'));
    }
    assert.deepEqual(s.requests.map(r => [r.id, r.language]), ['ko', 'ja', 'ko', 'ja'].flatMap(language =>
      popups.slice(0, 3).map(popup => [popup.id, language])));
    s.touch(); current.tree.props.onPress(); assert.deepEqual(s.opened, ['popup-1']);
  } finally { s.dispose(); }
});
