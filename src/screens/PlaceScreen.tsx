import { usePopupNavigation } from '../hooks/usePopupNavigation';
import { useEffect, useRef, useState } from 'react';
import { useScrollToTop } from 'expo-router';
import { Bell, Search, X } from 'lucide-react-native';
import { FlatList, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import AppliedFilterBar from '../components/place/AppliedFilterBar';
import type { VisitPeriod } from '../constants/placeFilters';
import PlaceFilterSheet from '../components/place/PlaceFilterSheet';
import PopupGridCard from '../components/place/PopupGridCard';
import { createPlaceCoverRecovery, mergeRecoveredCover } from '../lib/placeCoverRecovery';
import { getPopupDetail } from '../lib/popups';
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
  getPopupPage,
  type PopupRegionOption,
  type PopupStatus,
  type PopupTagOption,
  type PublicPopup,
} from '../lib/popups';
import { getRegions, getTags } from '../lib/filterOptions';
import { usePopupFavorites } from '../hooks/usePopupFavorites';

const tabs = ['탐색', '전체'] as const;
type PlaceTab = (typeof tabs)[number];
const categoryTagNames: Partial<Record<InterestId, string>> = {
  animeCharacter: '캐릭터/IP',
  beauty: '뷰티',
  game: '게임/디지털',
  fashion: '패션',
};
const emptyPopups: readonly PublicPopup[] = [];
type PopupListState = { queryKey: string; status: 'loading' | 'ready' | 'error'; popups: PublicPopup[]; nextCursor: string | null; loadingMore: boolean; moreError: boolean };
type OptionsState<T> = { status: 'loading' | 'ready' | 'error'; options: T[] };
type EndingSoonState = { country: CountryCode | undefined; status: 'loading' | 'ready' | 'error'; popups: PublicPopup[] };

function seoulDateString(date = new Date()): string {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function toggleId<T extends string | number>(ids: T[], id: T): T[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}

export default function PlaceScreen() {
  const openPopup = usePopupNavigation();
  const listRef = useRef<FlatList<PublicPopup>>(null);
  const [selectedTab, setSelectedTab] = useState<PlaceTab>('탐색');
  const scrollYRef = useRef(0);
  const tabPressScrollRef = useRef({
    scrollToTop: () => {
      if (scrollYRef.current > 0) {
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
      } else {
        setSelectedTab((current) => current === '탐색' ? '전체' : '탐색');
      }
    },
  });
  useScrollToTop(tabPressScrollRef);
  const [appliedFilters, setAppliedFilters] = useState(createEmptyPlaceFilters);
  const [draftQuickFilters, setDraftQuickFilters] = useState(createEmptyPlaceFilters);
  const [appliedDetailFilters, setAppliedDetailFilters] = useState(emptyPopupFilters);
  const [draftDetailFilters, setDraftDetailFilters] = useState(emptyPopupFilters);
  const [isFilterSheetOpen, setFilterSheetOpen] = useState(false);
  const [visitPeriod, setVisitPeriod] = useState<VisitPeriod>('all');
  const [draftVisitPeriod, setDraftVisitPeriod] = useState<VisitPeriod>('all');
  const { isFavorite, isFavoriteDisabled, toggleFavorite } = usePopupFavorites();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchSticky, setSearchSticky] = useState(false);
  const searchTop = useRef(Number.POSITIVE_INFINITY);
  const [popupListState, setPopupListState] = useState<PopupListState>({ queryKey: '', status: 'loading', popups: [], nextCursor: null, loadingMore: false, moreError: false });
  const listStateRef = useRef(popupListState);
  const listRequest = useRef<AbortController | null>(null);
  const latestQueryKey = useRef('');
  const coverRecovery = useRef<ReturnType<typeof createPlaceCoverRecovery> | null>(null);
  if (!coverRecovery.current) {
    coverRecovery.current = createPlaceCoverRecovery(getPopupDetail, (original, detail, fetchedAt) => {
      const current = listStateRef.current;
      const popups = mergeRecoveredCover(current.popups, original, detail, fetchedAt);
      if (popups.some((item, index) => item !== current.popups[index])) publishList({ ...current, popups });
    });
  }
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
  const filterOptionsCountry = isFilterSheetOpen ? draftQuickFilters.countries[0] : country;
  const regionIdsKey = appliedDetailFilters.regionIds.join(',');
  const tagIdsKey = appliedDetailFilters.tagIds.join(',');
  const hasAppliedFilters = appliedFilters.countries.length > 0
    || appliedFilters.quickFeatures.length > 0
    || appliedDetailFilters.regionIds.length > 0
    || appliedDetailFilters.tagIds.length > 0
    || appliedDetailFilters.status !== undefined
    || visitPeriod !== 'all';
  const queryKey = [country ?? '', regionIdsKey, tagIdsKey, appliedDetailFilters.status ?? '', visitPeriod, visitPeriod === 'all' ? '' : today].join('|');

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
    const countries: CountryCode[] = filterOptionsCountry ? [filterOptionsCountry] : ['KR', 'JP'];
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
  }, [filterOptionsCountry, isFilterSheetOpen]);

  const regions = [...regionStates.KR.options, ...regionStates.JP.options];
  const tags = tagState.options;
  const relevantRegionStates = filterOptionsCountry ? [regionStates[filterOptionsCountry]] : [regionStates.KR, regionStates.JP];
  const optionsStatus = [tagState, ...relevantRegionStates].some((item) => item.status === 'error') ? 'error'
    : [tagState, ...relevantRegionStates].some((item) => item.status === 'loading') ? 'loading' : 'ready';

  latestQueryKey.current = queryKey;
  function publishList(next: PopupListState) {
    listStateRef.current = next;
    setPopupListState(next);
  }
  function loadPage(after: string | null = null) {
    if (listRequest.current || selectedTab !== '전체') return;
    const current = listStateRef.current;
    if (after && (current.queryKey !== queryKey || current.status !== 'ready' || current.nextCursor !== after)) return;
    const controller = new AbortController();
    const coverImageFetchedAt = Date.now();
    listRequest.current = controller;
    publishList(after ? { ...current, loadingMore: true, moreError: false }
      : { queryKey, status: 'loading', popups: [], nextCursor: null, loadingMore: false, moreError: false });
    getPopupPage(country, controller.signal, { ...appliedDetailFilters, visitPeriod }, after)
      .then(page => {
        if (controller.signal.aborted || latestQueryKey.current !== queryKey) return;
        const previous = after ? listStateRef.current.popups : [];
        const seen = new Set(previous.map(popup => popup.publicId));
        publishList({ queryKey, status: 'ready', popups: [...previous, ...page.popups.filter(popup => {
          if (seen.has(popup.publicId)) return false;
          seen.add(popup.publicId); return true;
        }).map(popup => ({ ...popup, coverImageFetchedAt }))], nextCursor: page.nextCursor, loadingMore: false, moreError: false });
      }).catch(() => {
        if (controller.signal.aborted || latestQueryKey.current !== queryKey) return;
        publishList(after ? { ...listStateRef.current, loadingMore: false, moreError: true }
          : { queryKey, status: 'error', popups: [], nextCursor: null, loadingMore: false, moreError: false });
      }).finally(() => { if (listRequest.current === controller) listRequest.current = null; });
  }
  useEffect(() => {
    coverRecovery.current?.reset();
    listRequest.current?.abort();
    listRequest.current = null;
    publishList({ queryKey, status: 'loading', popups: [], nextCursor: null, loadingMore: false, moreError: false });
  }, [queryKey]);
  useEffect(() => {
    if (selectedTab === '전체' && listStateRef.current.status === 'loading') loadPage();
    // Retain data and active requests when switching tabs.
  }, [selectedTab, queryKey]);
  useEffect(() => () => { listRequest.current?.abort(); coverRecovery.current?.reset(); }, []);

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
    setDraftQuickFilters({ ...appliedFilters, countries: [...appliedFilters.countries], quickFeatures: [...appliedFilters.quickFeatures] });
    setDraftVisitPeriod(visitPeriod);
    setDraftDetailFilters({ ...appliedDetailFilters, regionIds: [...appliedDetailFilters.regionIds], tagIds: [...appliedDetailFilters.tagIds] });
    setFilterSheetOpen(true);
  };

  const cancelFilterSheet = () => {
    setDraftQuickFilters({ ...appliedFilters, countries: [...appliedFilters.countries], quickFeatures: [...appliedFilters.quickFeatures] });
    setDraftVisitPeriod(visitPeriod);
    setDraftDetailFilters({ ...appliedDetailFilters, regionIds: [...appliedDetailFilters.regionIds], tagIds: [...appliedDetailFilters.tagIds] });
    setFilterSheetOpen(false);
  };

  const applyFilterSheet = () => {
    if (draftQuickFilters.countries[0] !== country) regionSelection.current++;
    setAppliedFilters(draftQuickFilters);
    setVisitPeriod(draftVisitPeriod);
    setAppliedDetailFilters({ ...draftDetailFilters, regionIds: [...draftDetailFilters.regionIds], tagIds: [...draftDetailFilters.tagIds] });
    setFilterSheetOpen(false);
  };

  const resetAppliedFilters = () => {
    regionSelection.current++;
    categorySelection.current++;
    setVisitPeriod('all');
    setDraftVisitPeriod('all');
    setAppliedDetailFilters(emptyPopupFilters());
    setDraftDetailFilters(emptyPopupFilters());
    setAppliedFilters(createEmptyPlaceFilters());
    setDraftQuickFilters(createEmptyPlaceFilters());
  };

  const removeAppliedFilter = (group: 'countries' | 'quickFeatures' | 'regionIds' | 'tagIds' | 'status' | 'period', id: string | number) => {
    if (group === 'period') {
      setVisitPeriod('all');
      setDraftVisitPeriod('all');
    } else if (group === 'countries') {
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
        onEndReached={() => {
          const current = listStateRef.current;
          if (current.nextCursor && !current.moreError) loadPage(current.nextCursor);
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={selectedTab === '전체' ? popupListState.loadingMore
          ? <Text style={styles.stateText}>팝업을 불러오는 중이에요.</Text>
          : popupListState.moreError || status === 'error'
            ? <Pressable onPress={() => loadPage(popupListState.moreError ? popupListState.nextCursor : null)}>
              <Text style={styles.stateText}>다시 시도</Text>
            </Pressable> : null : null}
        keyExtractor={(item) => item.publicId}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        ItemSeparatorComponent={() => <View style={styles.gridRowGap} />}
        contentContainerStyle={[styles.listContent, contentPadding]}
        onScroll={(event) => {
          scrollYRef.current = Math.max(0, event.nativeEvent.contentOffset.y);
          setSearchSticky(scrollYRef.current >= searchTop.current);
        }}
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
              <View style={styles.searchInputRow}>
                <Search size={20} color={colors.inactiveText} />
                <TextInput
                  accessibilityLabel="팝업 검색"
                  placeholder="팝업을 검색해보세요"
                  placeholderTextColor={colors.inactiveText}
                  style={styles.searchInput}
                  returnKeyType="search"
                  value={searchQuery}
                  onChangeText={updateSearchQuery}
                />
              </View>
              {searchQuery.length > 0 && (
                <Pressable accessibilityRole="button" accessibilityLabel="검색어 지우기" onPress={() => updateSearchQuery('')} style={styles.clearSearch}>
                  <X size={18} color={colors.secondaryText} />
                </Pressable>
              )}
            </View>

            {selectedTab === '전체' && (
              <>
                <View style={styles.filters}>
                  {hasAppliedFilters ? (
                    <AppliedFilterBar
                      filters={appliedFilters}
                      detailFilters={appliedDetailFilters}
                      period={visitPeriod}
                      regions={regions}
                      tags={tags}
                      onRemove={removeAppliedFilter}
                      onReset={resetAppliedFilters}
                      onOpenDetails={openFilterSheet}
                    />
                  ) : (
                    <QuickFilterBar
                      selectedFilters={appliedFilters}
                      onToggleCountry={toggleCountry}
                      onToggleFeature={(id: QuickFeatureId) =>
                        setAppliedFilters((current) => ({ ...current, quickFeatures: toggleId(current.quickFeatures, id) }))}
                      onOpenDetails={openFilterSheet}
                    />
                  )}
                </View>
              </>
            )}
            <View
              style={selectedTab !== '탐색' && styles.hiddenExplore}
              pointerEvents={selectedTab === '탐색' ? 'auto' : 'none'}
              accessibilityElementsHidden={selectedTab !== '탐색'}
              importantForAccessibility={selectedTab === '탐색' ? 'auto' : 'no-hide-descendants'}
            >
                <TodayOpeningCarousel
                  key={country ?? 'ALL'}
                  items={endingSoonPopups}
                  width={carouselWidth}
                  today={today}
                  loading={endingSoonLoading}
                  error={endingSoonState.status === 'error'}
                  onPressPopup={(popup) => openPopup(popup.publicId)}
                />
                <PlaceRegionSection
                  pages={placeRegionPages}
                  width={carouselWidth}
                  onPress={selectExploreRegion}
                  isActive={selectedTab === '탐색'}
                />
                <PlaceWeeklySection
                  country={country}
                  isActive={selectedTab === '탐색'}
                  onPressPopup={(popup) => openPopup(popup.publicId)}
                  isFavorite={isFavorite}
                  isFavoriteDisabled={isFavoriteDisabled}
                  onToggleFavorite={(popup) => void toggleFavorite(popup)}
                />
                <PlaceInterestSection onPressCategory={selectInterestCategory} />
            </View>
          </View>
        )}
        renderItem={({ item }) => (
          <PopupGridCard
            item={item}
            width={cardWidth}
            isFavorite={isFavorite(item.publicId)}
            isFavoriteDisabled={isFavoriteDisabled(item.publicId)}
            onToggleFavorite={() => void toggleFavorite(item)}
            onPress={(popup) => openPopup(popup.publicId)}
            onRecoverCover={(popup) => coverRecovery.current!.recover(popup)}
          />
        )}
        extraData={{ isFavorite, isFavoriteDisabled }}
      />

      {isSearchSticky && (
        <View style={[styles.stickySearch, { left: spacing.space16 + insets.left, right: spacing.space16 + insets.right }]}>
          <View style={[styles.searchField, styles.stickySearchField]}>
            <View style={styles.searchInputRow}>
              <Search size={20} color={colors.inactiveText} />
              <TextInput
                accessibilityLabel="팝업 검색"
                placeholder="팝업을 검색해보세요"
                placeholderTextColor={colors.inactiveText}
                style={styles.searchInput}
                returnKeyType="search"
                value={searchQuery}
                onChangeText={updateSearchQuery}
              />
            </View>
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
        quickFilters={draftQuickFilters}
        onToggleCountry={(selectedCountry: CountryCode) => {
          setDraftQuickFilters((current) => ({
            ...current,
            countries: current.countries.includes(selectedCountry) ? [] : [selectedCountry],
          }));
          setDraftDetailFilters((current) => ({ ...current, regionIds: [] }));
        }}
        onToggleFeature={(id: QuickFeatureId) =>
          setDraftQuickFilters((current) => ({ ...current, quickFeatures: toggleId(current.quickFeatures, id) }))}
        period={draftVisitPeriod}
        onPeriodChange={setDraftVisitPeriod}
        country={filterOptionsCountry}
        regions={regions}
        tags={tags}
        optionsStatus={optionsStatus}
        onClose={cancelFilterSheet}
        onApply={applyFilterSheet}
        onReset={() => {
          setDraftQuickFilters(createEmptyPlaceFilters());
          setDraftDetailFilters(emptyPopupFilters());
          setDraftVisitPeriod('all');
        }}
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
  hiddenExplore: { display: 'none' },
  container: {
    flex: 1,
    paddingTop: 8,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.space4,
  },
  title: {
    ...typography.titleL,
    color: colors.text,
  },
  tabs: {
    flexDirection: 'row',
    columnGap: spacing.space20,
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
    color: colors.inactiveText,
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
  searchInputRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: spacing.space8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 0,
    includeFontPadding: false,
    textAlignVertical: 'center',
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
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
