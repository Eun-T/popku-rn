const assert = require('node:assert/strict');
const fs = require('node:fs');
const { test } = require('node:test');
const { inspectI18nUi } = require('./helpers/i18nUiGuard.cjs');
const scope = ['HomeTrendingSection','HomeNewPopupSection','HomeBanner'].map(n=>`src/components/home/${n}.tsx`)
  .concat(['PlaceRegionSection','PlaceInterestSection'].map(n=>`src/components/place/${n}.tsx`),
    ['src/app/reviews/[id].tsx','src/app/reviews/write.tsx','src/components/reviews/ReviewActions.tsx',
      'src/components/community/CommunityPostMenu.tsx','src/components/community/CommunityImageCarousel.tsx'],
    ['src/screens/CommunityScreen.tsx','src/app/community/[id].tsx','src/app/community/write.tsx',
      'src/components/community/CommunityPostItem.tsx','src/components/community/CommunityAuthor.tsx','src/components/community/CommunityComments.tsx',
      'src/screens/MapScreen.native.tsx','src/components/map/MapSearchOverlay.tsx','src/components/map/MapPopupPreviewCard.tsx','src/components/map/MapPopupListSheet.tsx',
      'src/app/places/[id].tsx','src/components/place/PopupReviews.tsx','src/components/place/PopupGuidanceCarousel.tsx','src/components/place/DirectionsSheet.tsx',
      'src/components/place/PlaceWeeklySection.tsx','src/components/place/IntroductionImageCarousel.tsx'],
    ["src/app/(tabs)/profile/index.tsx","src/app/profile/posts.tsx","src/app/profile/reviews.tsx","src/app/profile/favorites.tsx","src/components/profile/AccountSettingsScreen.tsx"],
    ["src/app/profile/settings.tsx","src/app/profile/language.tsx","src/app/(tabs)/profile/login.tsx","src/app/(tabs)/profile/signup.tsx","src/app/profile/withdrawal.tsx","src/app/profile/notices/index.tsx","src/app/profile/notices/[id].tsx","src/app/profile/inquiries/index.tsx","src/app/profile/inquiries/[id].tsx","src/app/profile/inquiries/write.tsx","src/components/profile/AccountSettingsScreen.tsx","src/components/profile/NoticeLayout.tsx","src/components/profile/InquiryLayout.tsx","src/components/profile/PolicyDetailScreen.tsx","src/app/profile/policies/index.tsx"]);

scope.push('src/components/place/PopupGridCard.tsx');
scope.push('src/components/profile/ThemePreferenceSheet.tsx');
scope.push('src/components/home/NewPopupCard.tsx', 'src/components/home/PopupRankingCard.tsx');

test('previously fixed home/place and stages 5/6 React UI follow the scoped i18n rules',()=>{
  for(const file of scope) assert.deepEqual(inspectI18nUi(fs.readFileSync(file,'utf8'),file),[],file);
});
test('guard resolves aliased/namespace global t calls in React and module translation',()=>{
  const source=`import { t as tr } from '../locales'; import * as locale from '../locales';
    const title=tr('key'); function Screen(){return <Text>{tr('key')}{locale.t('key')}</Text>;}`;
  assert.deepEqual(inspectI18nUi(source).map(i=>i.rule),['module-translation','global-t-in-react','global-t-in-react']);
});
test('guard detects direct/lazy translated initial state and definite missing memo/callback language deps',()=>{
  const source=`function Screen(){const {t:tr,resolvedLanguage}=useTranslation();
    const [title]=useState(tr('a'));const [lazy]=useState(()=>tr('b'));
    const label=useMemo(()=>tr('c'),[]);const cb=useCallback(()=>tr('d'),[id]);return <Text>{label}</Text>;}`;
  assert.deepEqual(inspectI18nUi(source).map(i=>i.rule),['translated-initial-state','translated-initial-state','translation-without-language-dependency','translation-without-language-dependency']);
});
test('guard also inspects memo-wrapped React component translations',()=>{
  const source=`import {t} from '../locales';const Screen=React.memo(()=> <Text>{t('key')}</Text>);`;
  assert.deepEqual(inspectI18nUi(source).map(i=>i.rule),['global-t-in-react']);
});
test('guard permits non-React global helpers, shadowed t, correct memo deps and uncertain dependency flow',()=>{
  const source=`import {t} from '../locales';function format(){return t('key');}
    const formatArrow=()=>t('key');function Screen(){const {t,resolvedLanguage}=useTranslation();
      const label=useMemo(()=>t('a'),[t]);const cb=useCallback(()=>t('b'),[resolvedLanguage]);
      const unknown=useMemo(()=>t('c'),dependencies);const uncertain=useMemo(()=>t('d'),[...dependencies]);
      const [draft]=useState('');return <Text>{label}{t('key')}</Text>;}`;
  assert.deepEqual(inspectI18nUi(source),[]);
});
