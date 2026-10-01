import { useEffect, useRef, useState } from 'react';
import { useRouter, useScrollToTop } from 'expo-router';
import { Bell, Search, X } from 'lucide-react-native';
import { FlatList, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import AppliedFilterBar from '../components/place/AppliedFilterBar';
import PlaceAllToolbar, { type PlaceSort, type VisitPeriod } from '../components/place/PlaceAllToolbar';
import PlaceFilterSheet from '../components/place/PlaceFilterSheet';
import PopupGridCard from '../components/place/PopupGridCard';
import PopupGridSkeleton from '../components/place/PopupGridSkeleton';
import QuickFilterBar from '../components/place/QuickFilterBar';
import PlaceRegionSection from '../components/place/PlaceRegionSection';
import PlaceInterestSection from '../components/place/PlaceInterestSection';
import PlaceWeeklySection from '../components/place/PlaceWeeklySection';
import TodayOpeningCarousel from '../components/place/TodayOpeningCarousel';
import { FLOATING_TAB_BAR_BOTTOM_GAP, FLOATING_TAB_BAR_HEIGHT } from '../components/navigation/FloatingTabBar';
import { placeRegionPages, type PlaceRegionCardItem } from '../constants/placeRegionMocks';
import {
  createEmptyPlaceFilters,
  regionFilters,
  type CountryCode,
  type InterestId,
  type QuickFeatureId,
} from '../constants/placeFilters';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { t } from '../locales';
import {
  emptyPopupFilters,
  getEndingSoonPopups,
  getPopups,
  type PopupRegionOption,
  type PopupStatus,
  type PopupTagOption,
  type PublicPopup,
} from '../lib/popups';
import { getRegions, getTags } from '../lib/filterOptions';

const tabs = ['탐색', '전체'] as const;
type PlaceTab = (typeof tabs)[number];
const categoryTagNames: Partial<Record<InterestId, string>> = {
  animeCharacter: '애니·캐릭터',
  beauty: '뷰티',
  game: '게임·디지털',
  fashion: '패션',
};
const emptyPopups: readonly PublicPopup[] = [];
type PopupListState = { queryKey: string; status: 'loading' | 'ready' | 'error'; popups: PublicPopup[] };
type OptionsState<T> = { status: 'loading' | 'ready' | 'error'; options: T[] };
type EndingSoonState = { country: CountryCode | undefined; status: 'loading' | 'ready' | 'error'; popups: PublicPopup[] };

function seoulDateString(date = new Date()): string {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function toggleId<T extends string | number>(ids: T[], id: T): T[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}

export default function PlaceScreen() {
  const router = useRouter();
  const listRef = useRef<FlatList<PublicPopup>>(null);
  useScrollToTop(listRef);
  const [selectedTab, setSelectedTab] = useState<PlaceTab>('탐색');
  const [appliedFilters, setAppliedFilters] = useState(createEmptyPlaceFilters);
  const [appliedDetailFilters, setAppliedDetailFilters] = useState(emptyPopupFilters);
  const [draftDetailFilters, setDraftDetailFilters] = useState(emptyPopupFilters);
  const [isFilterSheetOpen, setFilterSheetOpen] = useState(false);
  const [sort, setSort] = useState<PlaceSort>('latest');
  const [visitPeriod, setVisitPeriod] = useState<VisitPeriod>('all');
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchSticky, setSearchSticky] = useState(false);
  const searchTop = useRef(Number.POSITIVE_INFINITY);
  const [popupListState, setPopupListState] = useState<PopupListState>({ queryKey: '', status: 'loading', popups: [] });
  const [endingSoonState, setEndingSoonState] = useState<EndingSoonState>({ country: undefined, status: 'loading', popups: [] });
  const [today, setToday] = useState(seoulDateString);
  const [regionStates, setRegionStates] = useState<Record<CountryCode, OptionsState<PopupRegionOption>>>(() => ({
    KR: { status: 'loading', options: [] },
    JP: { status: 'loading', options: [] },
  }));
  const [tagState, setTagState] = useState<OptionsState<PopupTagOption>>({ status: 'loading', options: [] });
  const regionSelection = useRef(0);
  const categorySelection = useRef(0);
  const country = appliedFilters.countries[0];
  const regionIdsKey = appliedDetailFilters.regionIds.join(',');
  const tagIdsKey = appliedDetailFilters.tagIds.join(',');
  const queryKey = [country ?? '', regionIdsKey, tagIdsKey, appliedDetailFilters.status ?? ''].join('|');

  useEffect(() => {
    let active = true;
    if (tagState.status !== 'ready' && (tagState.status !== 'error' || isFilterSheetOpen)) {
      setTagState({ status: 'loading', options: [] });
      getTags().then((options) => {
        if (active) setTagState({ status: 'ready', options });
      }).catch(() => {
        if (active) setTagState({ status: 'error', options: [] });
      });
    }
    const countries: CountryCode[] = country ? [country] : ['KR', 'JP'];
    for (const code of countries) {
      const current = regionStates[code];
      if (current.status === 'ready' || (current.status === 'error' && !isFilterSheetOpen)) continue;
      setRegionStates((states) => ({ ...states, [code]: { status: 'loading', options: [] } }));
      getRegions(code).then((options) => {
        if (active) setRegionStates((states) => ({
          ...states, [code]: { status: 'ready', options: options.map((option) => ({ ...option, countryCode: code })) },
        }));
      }).catch(() => {
        if (active) setRegionStates((states) => ({ ...states, [code]: { status: 'error', options: [] } }));
      });
    }
    return () => { active = false; };
  }, [country, isFilterSheetOpen]);

  const regions = [...regionStates.KR.options, ...regionStates.JP.options];
  const tags = tagState.options;
  const relevantRegionStates = country ? [regionStates[country]] : [regionStates.KR, regionStates.JP];
  const optionsStatus = [tagState, ...relevantRegionStates].some((item) => item.status === 'error') ? 'error'
    : [tagState, ...relevantRegionStates].some((item) => item.status === 'loading') ? 'loading' : 'ready';

  useEffect(() => {
    const controller = new AbortController();
    setPopupListState({ queryKey, status: 'loading', popups: [] });
    getPopups(country, controller.signal, appliedDetailFilters)
      .then((popups) => {
        if (!controller.signal.aborted) setPopupListState({ queryKey, status: 'ready', popups });
      })
      .catch(() => {
        if (!controller.signal.aborted) setPopupListState({ queryKey, status: 'error', popups: [] });
      });
    return () => controller.abort();
  }, [queryKey]);

  useEffect(() => {
    const timer = setInterval(() => setToday(seoulDateString()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    getEndingSoonPopups(country, controller.signal)
      .then((popups) => {
        if (!controller.signal.aborted) setEndingSoonState({ country, status: 'ready', popups });
      })
      .catch(() => {
        if (!controller.signal.aborted) setEndingSoonState((current) => ({
          country, status: 'error', popups: current.country === country ? current.popups : [],
        }));
      });
    return () => controller.abort();
  }, [country, today]);

  const status = popupListState.queryKey === queryKey ? popupListState.status : 'loading';
  const visiblePopups = status === 'ready' ? popupListState.popups : emptyPopups;
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const searchedPopups = normalizedQuery
    ? visiblePopups.filter((popup) => popup.name.toLocaleLowerCase().includes(normalizedQuery))
    : visiblePopups;
  const endingSoonEnd = new Date(Date.parse(`${today}T00:00:00Z`) + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const endingSoonPopups = endingSoonState.country === country
    ? endingSoonState.popups.filter((popup) => popup.startDate <= today && popup.endDate >= today && popup.endDate <= endingSoonEnd).slice(0, 7)
    : emptyPopups;
  const endingSoonLoading = endingSoonState.country !== country || endingSoonState.status === 'loading';
  const stateMessage = status === 'loading' ? '팝업을 불러오는 중이에요.'
    : status === 'error' ? '팝업을 불러오지 못했어요.' : '표시할 팝업이 없어요.';
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const contentPadding = {
    paddingLeft: spacing.space16 + insets.left,
    paddingRight: spacing.space16 + insets.right,
  };
  const cardWidth = (width - insets.left - insets.right - spacing.space16 * 2 - spacing.space12) / 2;
  const carouselWidth = width - insets.left - insets.right - spacing.space16 * 2;
  const selectExploreRegion = (item: PlaceRegionCardItem) => {
    categorySelection.current++;
    const source = regionFilters.find((region) => region.id === item.id);
    const selection = ++regionSelection.current;
    setAppliedFilters((current) => ({ ...current, countries: source ? [source.country] : [] }));
    setAppliedDetailFilters((current) => ({ ...current, regionIds: [] }));
    setDraftDetailFilters((current) => ({ ...current, regionIds: [] }));
    if (source) {
      getRegions(source.country).then((options) => {
        if (selection !== regionSelection.current) return;
        const matched = options.find((region) => region.name === t(source.labelKey));
        setAppliedDetailFilters((current) => ({ ...current, regionIds: matched ? [matched.id] : [] }));
      }).catch(() => { /* The filter options effect shows the request error. */ });
    }
    setSelectedTab('전체');
  };

  const selectInterestCategory = async (id: InterestId) => {
    const tagName = categoryTagNames[id];
    if (!tagName) return;
    const selection = ++categorySelection.current;
    try {
      const options = tagState.status === 'ready' ? tagState.options : await getTags();
      if (selection !== categorySelection.current) return;
      if (tagState.status !== 'ready') setTagState({ status: 'ready', options });
      const tag = options.find((option) => option.name === tagName);
      if (!tag) return;

      setAppliedFilters((current) => ({ ...createEmptyPlaceFilters(), countries: current.countries }));
      const detailFilters = { ...emptyPopupFilters(), tagIds: [tag.id] };
      setAppliedDetailFilters(detailFilters);
      setDraftDetailFilters(detailFilters);
      setSelectedTab('전체');
    } catch {
      // The existing tag options request displays its error state.
    }
  };

  const toggleCountry = (selectedCountry: CountryCode) => {
    regionSelection.current++;
    setAppliedFilters((current) => {
      const isSelected = current.countries.includes(selectedCountry);
      return {
        ...current,
        countries: isSelected ? [] : [selectedCountry],
      };
    });
    setAppliedDetailFilters((current) => ({ ...current, regionIds: [] }));
    setDraftDetailFilters((current) => ({ ...current, regionIds: [] }));
  };

  const toggleRegion = (id: number) => {
    setDraftDetailFilters((current) => ({
      ...current,
      regionIds: toggleId(current.regionIds, id),
    }));
  };

  const openFilterSheet = () => {
    setDraftDetailFilters({ ...appliedDetailFilters, regionIds: [...appliedDetailFilters.regionIds], tagIds: [...appliedDetailFilters.tagIds] });
    setFilterSheetOpen(true);
  };

  const cancelFilterSheet = () => {
    setDraftDetailFilters({ ...appliedDetailFilters, regionIds: [...appliedDetailFilters.regionIds], tagIds: [...appliedDetailFilters.tagIds] });
    setFilterSheetOpen(false);
  };

  const applyFilterSheet = () => {
    setAppliedDetailFilters({ ...draftDetailFilters, regionIds: [...draftDetailFilters.regionIds], tagIds: [...draftDetailFilters.tagIds] });
    setFilterSheetOpen(false);
  };

  const removeAppliedFilter = (group: 'countries' | 'quickFeatures' | 'regionIds' | 'tagIds' | 'status', id: string | number) => {
    if (group === 'countries') {
      regionSelection.current++;
      setAppliedFilters((current) => ({ ...current, countries: [] }));
      setAppliedDetailFilters((current) => ({ ...current, regionIds: [] }));
      setDraftDetailFilters((current) => ({ ...current, regionIds: [] }));
    } else if (group === 'quickFeatures') {
      setAppliedFilters((current) => ({ ...current, quickFeatures: current.quickFeatures.filter((item) => item !== id) }));
    } else if (group === 'regionIds') {
      setAppliedDetailFilters((current) => ({ ...current, regionIds: current.regionIds.filter((item) => item !== id) }));
    } else if (group === 'tagIds') {
      setAppliedDetailFilters((current) => ({ ...current, tagIds: current.tagIds.filter((item) => item !== id) }));
    } else {
      setAppliedDetailFilters((current) => ({ ...current, status: undefined }));
    }
  };

  const toggleFavorite = (id: string) => {
    setFavoriteIds((current) => toggleId(current, id));
  };

  const updateSearchQuery = (value: string) => {
    setSearchQuery(value);
    if (value.trim()) {
      categorySelection.current++;
      setSelectedTab('전체');
    }
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.container}>
      <View style={[styles.header, contentPadding]}>
        <Text style={styles.title}>플레이스</Text>
        <Bell size={24} color={colors.text} accessibilityLabel="알림" />
      </View>

      <View style={styles.listArea}>
      <FlatList
        ref={listRef}
        style={styles.list}
        data={selectedTab === '전체' ? searchedPopups : emptyPopups}
        keyExtractor={(item) => item.publicId}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        ItemSeparatorComponent={() => <View style={styles.gridRowGap} />}
        contentContainerStyle={[styles.listContent, contentPadding]}
        onScroll={(event) => setSearchSticky(event.nativeEvent.contentOffset.y >= searchTop.current)}
        scrollEventThrottle={16}
        ListEmptyComponent={selectedTab === '전체'
          ? status === 'loading'
            ? <PopupGridSkeleton cardWidth={cardWidth} />
            : <Text style={styles.stateText}>{stateMessage}</Text>
          : null}
        ListHeaderComponent={(
          <View style={selectedTab === '전체' && styles.listHeaderWithGrid}>
            <View style={styles.tabs}>
              {tabs.map((tab) => {
                const isSelected = selectedTab === tab;

                return (
                  <Pressable
                    key={tab}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => {
                      categorySelection.current++;
                      setSelectedTab(tab);
                    }}
                    style={[styles.tab, isSelected && styles.selectedTab]}
                  >
                    <Text style={[styles.tabText, isSelected && styles.selectedTabText]}>{tab}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.searchField} onLayout={(event) => { searchTop.current = event.nativeEvent.layout.y; }}>
              <Search size={20} color={colors.secondaryText} />
              <TextInput
                accessibilityLabel="팝업 검색"
                placeholder="팝업을 검색해보세요"
                placeholderTextColor={colors.secondaryText}
                style={styles.searchInput}
                returnKeyType="search"
                value={searchQuery}
                onChangeText={updateSearchQuery}
              />
              {searchQuery.length > 0 && (
                <Pressable accessibilityRole="button" accessibilityLabel="검색어 지우기" onPress={() => updateSearchQuery('')} style={styles.clearSearch}>
                  <X size={18} color={colors.secondaryText} />
                </Pressable>
              )}
            </View>

            {selectedTab === '전체' && (
              <>
                <View style={styles.filters}>
                  <QuickFilterBar
                    selectedFilters={appliedFilters}
                    onToggleCountry={toggleCountry}
                    onToggleFeature={(id: QuickFeatureId) =>
                      setAppliedFilters((current) => ({ ...current, quickFeatures: toggleId(current.quickFeatures, id) }))}
                    onOpenDetails={openFilterSheet}
                  />
                </View>
                <AppliedFilterBar
                  filters={appliedFilters}
                  detailFilters={appliedDetailFilters}
                  regions={regions}
                  tags={tags}
                  onRemove={removeAppliedFilter}
                  onReset={() => {
                    setAppliedDetailFilters(emptyPopupFilters());
                    setAppliedFilters((current) => ({ ...current, quickFeatures: [] }));
                  }}
                />
                <PlaceAllToolbar
                  sort={sort}
                  onSortChange={setSort}
                  period={visitPeriod}
                  onPeriodChange={setVisitPeriod}
                />
              </>
            )}
            {selectedTab === '탐색' && (
              <>
                <TodayOpeningCarousel
                  key={country ?? 'ALL'}
                  items={endingSoonPopups}
                  width={carouselWidth}
                  today={today}
                  loading={endingSoonLoading}
                  error={endingSoonState.status === 'error'}
                  onPressPopup={(popup) => router.push({ pathname: '/places/[id]', params: { id: popup.publicId } })}
                />
                {visiblePopups.length === 0 && <Text style={styles.stateText}>{stateMessage}</Text>}
                <PlaceRegionSection
                  pages={placeRegionPages}
                  width={carouselWidth}
                  onPress={selectExploreRegion}
                />
                <PlaceWeeklySection
                  popups={visiblePopups}
                  onPressPopup={(popup) => router.push({ pathname: '/places/[id]', params: { id: popup.publicId } })}
                />
                <PlaceInterestSection onPressCategory={selectInterestCategory} />
              </>
            )}
          </View>
        )}
        renderItem={({ item }) => (
          <PopupGridCard
            item={item}
            width={cardWidth}
            isFavorite={favoriteIds.includes(item.publicId)}
            onToggleFavorite={toggleFavorite}
            onPress={(popup) => router.push({ pathname: '/places/[id]', params: { id: popup.publicId } })}
          />
        )}
        extraData={favoriteIds}
      />

      {isSearchSticky && (
        <View style={[styles.stickySearch, { left: spacing.space16 + insets.left, right: spacing.space16 + insets.right }]}>
          <View style={[styles.searchField, styles.stickySearchField]}>
            <Search size={20} color={colors.secondaryText} />
            <TextInput
              accessibilityLabel="팝업 검색"
              placeholder="팝업을 검색해보세요"
              placeholderTextColor={colors.secondaryText}
              style={styles.searchInput}
              returnKeyType="search"
              value={searchQuery}
              onChangeText={updateSearchQuery}
            />
            {searchQuery.length > 0 && (
              <Pressable accessibilityRole="button" accessibilityLabel="검색어 지우기" onPress={() => updateSearchQuery('')} style={styles.clearSearch}>
                <X size={18} color={colors.secondaryText} />
              </Pressable>
            )}
          </View>
        </View>
      )}
      </View>

      <PlaceFilterSheet
        visible={isFilterSheetOpen}
        filters={draftDetailFilters}
        country={country}
        regions={regions}
        tags={tags}
        optionsStatus={optionsStatus}
        onClose={cancelFilterSheet}
        onApply={applyFilterSheet}
        onReset={() => setDraftDetailFilters(emptyPopupFilters())}
        onToggleRegion={toggleRegion}
        onToggleTag={(id: number) =>
          setDraftDetailFilters((current) => ({ ...current, tagIds: toggleId(current.tagIds, id) }))}
        onToggleStatus={(selectedStatus: PopupStatus) =>
          setDraftDetailFilters((current) => ({ ...current, status: current.status === selectedStatus ? undefined : selectedStatus }))}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: spacing.space24,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.space12,
  },
  title: {
    ...typography.titleL,
    color: colors.text,
  },
  tabs: {
    flexDirection: 'row',
    columnGap: spacing.space20,
    marginTop: spacing.space12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    paddingVertical: spacing.space12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  selectedTab: {
    borderBottomColor: '#000000',
  },
  tabText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.inactiveTabText,
  },
  selectedTabText: {
    fontWeight: '700',
    color: colors.text,
  },
  stickySearch: {
    position: 'absolute',
    top: 0,
    zIndex: 1,
    paddingBottom: spacing.space8,
    backgroundColor: colors.background,
  },
  stickySearchField: {
    marginTop: 0,
  },
  searchField: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: spacing.space8,
    marginTop: spacing.space20,
    paddingHorizontal: spacing.space16,
    borderRadius: radius.radius12,
    backgroundColor: colors.moreButtonBackground,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 0,
    ...typography.body,
    color: colors.text,
  },
  clearSearch: {
    width: 28,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filters: {
    marginTop: spacing.space16,
  },
  listArea: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: FLOATING_TAB_BAR_HEIGHT + FLOATING_TAB_BAR_BOTTOM_GAP + spacing.space40,
  },
  listHeaderWithGrid: {
    paddingBottom: spacing.space16,
  },
  gridRow: {
    columnGap: spacing.space12,
    alignItems: 'flex-start',
  },
  gridRowGap: {
    height: spacing.space24,
  },
  stateText: {
    ...typography.body,
    color: colors.secondaryText,
  },
});
