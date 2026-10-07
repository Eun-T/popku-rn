const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const ts = require('typescript');

function load(file, mocks) {
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => {
    assert.ok(name in mocks, `Unexpected dependency: ${name}`);
    return mocks[name];
  }, exports);
  return exports;
}
const jsx = (type, props) => ({ type, props });
const theme = load('src/theme/tokens.ts', {});
const { popupOperatingStatus } = load('src/lib/popupStatus.ts', {});
const mocks = {
  'expo-image': { Image: 'Image' },
  '../../hooks/usePlaceCoverImage': { usePlaceCoverImage: item => ({ source: item.coverImageUrl
    ? {uri:item.coverImageUrl,...(item.coverImageCacheKey ? {cacheKey:item.coverImageCacheKey} : {})} : null, onError(){} }) },
  react: { useState: initial => [initial, () => {}] },
  'react/jsx-runtime': { jsx, jsxs: jsx },
  'lucide-react-native': { Heart: 'Heart', MapPin: 'MapPin' },
  '@expo/vector-icons': { Ionicons: 'Ionicons' },
  'react-native': { Image: 'Image', Pressable: 'Pressable', Text: 'Text', View: 'View', StyleSheet: { create: styles => styles }, useWindowDimensions: () => ({ fontScale: 1 }) },
  '../../theme/tokens': theme,
  '../../lib/popupStatus': {
    popupOperatingStatus: (start, end) => popupOperatingStatus(start, end, new Date(2026, 9, 6, 12)),
  },
  '../../locales': { t: key => key },
  '../../../assets/images/ranking-placeholder.png': 'placeholder',
};
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
const popup = { publicId: 'popup', name: 'Popup', startDate: '2000-01-01', endDate: '2100-01-01', tags: [], regionName: 'Seoul' };
function assertShadow(style) {
  assert.equal(style.shadowColor, '#000000');
  assert.equal(style.shadowOpacity, 0.25);
  assert.equal(style.shadowRadius, 2);
  assert.deepEqual(style.shadowOffset, { width: 0, height: 1 });
  assert.equal(style.elevation, 2);
}

test('place grid poster favorite has no circle, keeps 40px target/position and existing toggle isolation', () => {
  const Card = load('src/components/place/PopupGridCard.tsx', mocks).default;
  for (const selected of [false, true]) for (const disabled of [false, true]) {
    let toggles = 0, opens = 0, stopped = 0;
    const tree = Card({ item: popup, width: 170, isFavorite: selected, isFavoriteDisabled: disabled,
      onToggleFavorite: () => toggles++, onPress: () => opens++ });
    const button = nodes(tree).find(node => node.type === 'Pressable' && node.props.accessibilityState);
    const iconWrapper = button.props.children;
    assert.equal(iconWrapper.props.pointerEvents, 'none');
    assert.equal(iconWrapper.props.accessible, false);
    assert.equal(iconWrapper.props.style.width, 26);
    assert.equal(iconWrapper.props.style.height, 26);
    const [outline, icon] = iconWrapper.props.children;
    assert.equal(outline.type, 'Heart');
    assert.equal(outline.props.size, 26);
    assert.equal(outline.props.color, selected ? '#FF5A6E' : '#111827');
    assert.equal(outline.props.strokeWidth, 2);
    assert.equal(outline.props.fill, 'none');
    assert.deepEqual(outline.props.style, { position: 'absolute', top: 0, left: 0 });
    assert.deepEqual(icon.props.style, outline.props.style);
    assert.equal(icon.type, 'Heart');
    assert.equal(icon.props.size, 26);
    assert.equal(icon.props.strokeWidth, 2);
    assert.equal(icon.props.color, selected ? '#FF5A6E' : '#FFFFFF');
    assert.equal(icon.props.fill, selected ? '#FF5A6E' : '#6B7280');
    assert.equal(button.props.style.backgroundColor, undefined);
    assert.equal(button.props.style.borderRadius, undefined);
    assert.equal(button.props.style.borderWidth, undefined);
    assert.equal(button.props.style.width, 40);
    assert.equal(button.props.style.height, 40);
    assert.equal(button.props.style.right, 8);
    assert.equal(button.props.style.bottom, 8);
    assert.equal(button.props.disabled, disabled);
    assert.deepEqual(button.props.accessibilityState, { selected, disabled });
    assertShadow(button.props.style);
    button.props.onPress({ stopPropagation: () => stopped++ });
    assert.equal(stopped, 1); assert.equal(toggles, 1); assert.equal(opens, 0);
    tree.props.onPress(); assert.equal(opens, 1);
  }
});

test('grid cover uses expo-image memory-disk and the server cache identifier without a transition',()=>{
  const Card=load('src/components/place/PopupGridCard.tsx',mocks).default;
  const item={...popup,coverImageUrl:'signed-a',coverImageCacheKey:'opaque-object-a'};
  const tree=Card({item,width:170,isFavorite:false,isFavoriteDisabled:false,onToggleFavorite(){}});
  const image=nodes(tree).find(n=>n.type==='Image');
  assert.deepEqual(image.props.source,{uri:'signed-a',cacheKey:'opaque-object-a'});
  assert.equal(image.props.cachePolicy,'memory-disk');assert.equal(image.props.contentFit,'cover');
  assert.equal(image.props.transition,undefined);assert.equal(image.props.resizeMode,undefined);
});

test('grid information has four compact lines with inclusive status dates and an unambiguous single period', () => {
  const Card = load('src/components/place/PopupGridCard.tsx', mocks).default;
  for (const [startDate, endDate, status, period, textColor] of [
    ['2026-10-06', '2026-10-11', '진행중', '26.10.06 ~ 26.10.11', '#15803D'],
    ['2026-10-01', '2026-10-06', '진행중', '26.10.01 ~ 26.10.06', '#15803D'],
    ['2026-10-07', '2026-11-01', '오픈예정', '26.10.07 ~ 26.11.01', '#1D4ED8'],
    ['2026-10-01', '2026-10-05', '종료됨', '26.10.01 ~ 26.10.05', '#6B7280'],
    ['2026-12-31', '2027-01-02', '오픈예정', '26.12.31 ~ 27.01.02', '#1D4ED8'],
  ]) {
    for (const width of [110, 170, 280]) {
    const tree = Card({ item: { ...popup, startDate, endDate }, width,
      isFavorite: false, isFavoriteDisabled: false, onToggleFavorite() {} });
    const [, first, title, periodNode, metadata] = tree.props.children;
    assert.equal(tree.props.children.length, 5, 'poster plus exactly four information lines');
    const badgeStyle = Object.assign({}, ...(Array.isArray(first.props.style) ? first.props.style : [first.props.style]));
    assert.equal(badgeStyle.marginTop, 8);
    assert.equal(badgeStyle.columnGap, undefined);
    assert.equal(badgeStyle.backgroundColor, undefined);
    assert.equal(badgeStyle.borderRadius, undefined);
    assert.equal(badgeStyle.paddingHorizontal, undefined);
    assert.equal(badgeStyle.paddingVertical, undefined);
    assert.equal(badgeStyle.maxWidth, '100%');
    assert.equal(badgeStyle.flexWrap, 'nowrap');
    const statusBadgeNode = first.props.children;
    assert.equal(nodes(first).filter(n => n.type === 'Text').length, 1, 'status has its own line');
    assert.ok(!nodes(tree).some(n => (JSON.stringify(n.props.style) ?? '').includes('#D1D5DB')));
    assert.equal(badgeStyle.alignItems, 'center');
    assert.equal(statusBadgeNode.type, 'View');
    const statusBadgeStyle = Object.assign({}, ...statusBadgeNode.props.style);
    assert.equal(statusBadgeStyle.flexShrink, 0);
    assert.equal(statusBadgeStyle.borderRadius, 5);
    assert.equal(statusBadgeStyle.paddingHorizontal, 5);
    assert.equal(statusBadgeStyle.paddingVertical, 1);
    assert.equal(statusBadgeStyle.alignItems, 'center');
    assert.equal(statusBadgeStyle.backgroundColor, status === '진행중' ? '#DCFCE7' : status === '오픈예정' ? '#DBEAFE' : '#F3F4F6');
    const statusNode = statusBadgeNode.props.children;
    assert.equal(statusNode.props.children, status);
    const statusStyle = Object.assign({}, ...(Array.isArray(statusNode.props.style) ? statusNode.props.style : [statusNode.props.style]));
    const periodStyle = Object.assign({}, ...(Array.isArray(periodNode.props.style) ? periodNode.props.style : [periodNode.props.style]));
    assert.equal(statusStyle.color, textColor);
    assert.equal(statusStyle.fontWeight, '600');
    assert.equal(statusStyle.fontSize, 12);
    assert.equal(statusStyle.lineHeight, 16);
    assert.equal(statusBadgeStyle.paddingVertical * 2 + statusStyle.lineHeight, 18, 'compact status badge preserves the original 18px row height');
    assert.equal(statusStyle.flexShrink, 0);
    assert.equal(statusNode.props.numberOfLines, 1);
    assert.equal(periodNode.props.children, period);
    assert.equal(periodNode.props.numberOfLines, 1);
    assert.equal(periodNode.props.ellipsizeMode, 'tail');
    assert.equal(periodStyle.flexShrink, 1);
    assert.equal(periodStyle.minWidth, 0);
    assert.equal(periodStyle.color, '#6B7280');
    assert.equal(periodStyle.fontWeight, '400');
    assert.equal(periodStyle.fontSize, 14);
    assert.equal(periodStyle.lineHeight, 20);
    assert.equal(periodStyle.marginTop, 6);
    assert.equal(title.props.children, popup.name);
    assert.equal(title.props.style.fontSize, 16);
    assert.equal(title.props.style.fontWeight, '700');
    assert.equal(title.props.style.marginTop, 6);
    assert.equal(Object.assign({}, ...metadata.props.style).marginTop, 6);
    assert.equal(Object.assign({}, ...metadata.props.style).flexWrap, 'nowrap');
    }
  }
});


test('single category metadata appears immediately and preserves region ellipsis without measurements', () => {
  const Card = load('src/components/place/PopupGridCard.tsx', mocks).default;
  for (const width of [110, 170, 280]) for (const regionName of [' 용산 ', '매우 긴 지역 이름', null]) {
    const tree = Card({ item: { ...popup, regionName, tags: [{ id: 1, name: '캐릭터/IP' }] }, width,
      isFavorite: false, isFavoriteDisabled: false, onToggleFavorite() {} });
    const row = tree.props.children[4];
    assert.equal(row.props.onLayout, undefined);
    assert.equal(nodes(row).filter(n => n.props.onLayout).length, 0);
    const [location, category] = row.props.children;
    assert.equal(category.props.children.props.children, '캐릭터/IP');
    assert.equal(category.props.style.flexShrink, 0);
    assert.equal(category.props.style.backgroundColor, '#F3F4F6');
    assert.equal(Object.assign({}, ...category.props.children.props.style).color, '#4B5563');
    assert.equal(category.props.style.paddingHorizontal, 4);
    if (regionName) {
      assert.equal(location.props.children[0].type, 'Ionicons');
      assert.equal(location.props.children[0].props.name, 'location-sharp');
      assert.equal(location.props.children[0].props.fill, undefined);
      assert.equal(location.props.children[0].props.color, '#6B7280');
      assert.equal(location.props.children[0].props.size, 16);
      assert.equal(location.props.style.flexShrink, 1);
      assert.equal(location.props.style.minWidth, 0);
      assert.equal(location.props.children[1].props.numberOfLines, 1);
      assert.equal(location.props.children[1].props.ellipsizeMode, 'tail');
    } else assert.equal(location, false);
  }
});

test('legacy multiple categories are preserved and never assigned by array order', () => {
  const Card = load('src/components/place/PopupGridCard.tsx', mocks).default;
  const tags = [{ id: 1, name: '캐릭터/IP' }, { id: 2, name: '게임/디지털' }];
  const row = Card({ item: { ...popup, tags }, width: 170, isFavorite: false,
    isFavoriteDisabled: false, onToggleFavorite() {} }).props.children[4];
  assert.equal(row.props.children[1], false);
  assert.equal(tags.length, 2);
});

test('place weekly favorite uses 18px heart/shadow without changing body colors, target or toggle', () => {
  const Weekly = load('src/components/place/PlaceWeeklyPopupList.tsx', mocks).default;
  for (const selected of [false, true]) {
    let toggled;
    const tree = Weekly({ selectedWeek: new Date(), popups: [popup], onPressPopup() {},
      isFavorite: () => selected, isFavoriteDisabled: () => false, onToggleFavorite: value => { toggled = value; } });
    const button = nodes(tree).find(node => node.type === 'Pressable' && node.props.accessibilityState);
    assert.equal(button.props.children.props.size, 18);
    assert.equal(button.props.children.props.color, selected ? '#22C55E' : '#111827');
    assert.equal(button.props.children.props.fill, selected ? '#22C55E' : 'none');
    assert.equal(button.props.style.minWidth, 68);
    assert.equal(button.props.style.height, 36);
    assertShadow(button.props.children.props.style);
    button.props.onPress({ stopPropagation() {} });
    assert.equal(toggled, popup);
  }
});
