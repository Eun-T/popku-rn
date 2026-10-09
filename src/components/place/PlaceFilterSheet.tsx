import { getRegionDisplayName, getTagDisplayName } from '../../locales/filterLabels';
import { useTranslation } from '../../hooks/useTranslation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import MoreButton from '../common/MoreButton';
import RegionFilterGroup from './RegionFilterGroup';
import { operationStatusFilters, quickFilters, visitPeriodOptions, type PlaceFilterState, type QuickFeatureId, type VisitPeriod, type CountryCode } from '../../constants/placeFilters';
import type { AppliedPopupFilters, PopupRegionOption, PopupStatus, PopupTagOption } from '../../lib/popups';
import { t } from '../../locales';
import { colors, radius, spacing, typography } from '../../theme/tokens';

type FilterOption<T extends string | number> = { id: T; name: string };

type FilterChipGroupProps<T extends string | number> = {
  options: readonly FilterOption<T>[];
  selected: readonly T[];
  onToggle: (id: T) => void;
};

function FilterChipGroup<T extends string | number>({ options, selected, onToggle }: FilterChipGroupProps<T>) {
  return (
    <View style={styles.chipGroup}>
      {options.map((option) => {
        const isSelected = selected.includes(option.id);

        return (
          <Pressable
            key={option.id}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            onPress={() => onToggle(option.id)}
            style={[styles.chip, isSelected && styles.selectedChip]}
          >
            <Text numberOfLines={1} style={[styles.chipText, isSelected && styles.selectedChipText]}>
              {option.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

type PlaceFilterSheetProps = {
  visible: boolean;
  filters: AppliedPopupFilters;
  quickFilters: PlaceFilterState;
  onToggleCountry: (country: CountryCode) => void;
  onToggleFeature: (feature: QuickFeatureId) => void;
  period: VisitPeriod;
  onPeriodChange: (period: VisitPeriod) => void;
  country: CountryCode | undefined;
  regions: readonly PopupRegionOption[];
  tags: readonly PopupTagOption[];
  optionsStatus: 'loading' | 'ready' | 'error';
  onClose: () => void;
  onApply: () => void;
  onReset: () => void;
  onToggleRegion: (id: number) => void;
  onToggleTag: (id: number) => void;
  onToggleStatus: (status: PopupStatus) => void;
};

export default function PlaceFilterSheet({
  visible,
  filters,
  quickFilters: selectedQuickFilters,
  onToggleCountry,
  onToggleFeature,
  period,
  onPeriodChange,
  country,
  regions,
  tags,
  optionsStatus,
  onClose,
  onApply,
  onReset,
  onToggleRegion,
  onToggleTag,
  onToggleStatus,
}: PlaceFilterSheetProps) {
  useTranslation();
  const statusOptions: readonly FilterOption<PopupStatus>[] = [
    { id: 'ONGOING', name: t(operationStatusFilters[0].labelKey) },
    { id: 'UPCOMING', name: t(operationStatusFilters[1].labelKey) },
    { id: 'ENDED', name: t(operationStatusFilters[2].labelKey) },
  ];
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const sheetHeight = height * 0.7;
  const [isModalVisible, setModalVisible] = useState(visible);
  const translateY = useRef(new Animated.Value(sheetHeight)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const animation = useRef<Animated.CompositeAnimation | null>(null);
  const hasShown = useRef(false);
  const latestVisible = useRef(visible);
  latestVisible.current = visible;
  const koreanRegions = regions.filter((region) => region.countryCode === 'KR' && (!country || country === 'KR'));
  const japaneseRegions = regions.filter((region) => region.countryCode === 'JP' && (!country || country === 'JP'));

  const animate = useCallback((open: boolean) => {
    animation.current?.stop();
    animation.current = Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: open ? 1 : 0, duration: open ? 250 : 200, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: open ? 0 : sheetHeight, duration: open ? 250 : 200, useNativeDriver: true }),
    ]);
    animation.current.start(({ finished }) => {
      if (finished && !open && !latestVisible.current) {
        hasShown.current = false;
        setModalVisible(false);
      }
    });
  }, [backdropOpacity, sheetHeight, translateY]);

  useEffect(() => {
    if (visible) {
      if (!hasShown.current) {
        translateY.setValue(sheetHeight);
        backdropOpacity.setValue(0);
        setModalVisible(true);
      } else {
        animate(true);
      }
    } else if (hasShown.current) {
      animate(false);
    } else {
      setModalVisible(false);
    }
  }, [visible, animate, backdropOpacity, sheetHeight, translateY]);

  useEffect(() => () => animation.current?.stop(), []);
  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) =>
      gesture.dy > 5 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderMove: (_, gesture) => translateY.setValue(Math.max(0, gesture.dy)),
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dy > 80 || gesture.vy > 0.75) {
        onClose();
      } else {
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
      }
    },
    onPanResponderTerminate: () => {
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
    },
  }), [onClose, translateY]);

  if (!isModalVisible) return null;

  return (
    <Modal
      visible={isModalVisible}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
      onShow={() => {
        hasShown.current = true;
        animate(latestVisible.current);
      }}
    >
      <View style={styles.modal}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable accessibilityLabel={t('place.filters.close')} onPress={onClose} style={StyleSheet.absoluteFill} />
        </Animated.View>
        <Animated.View style={[styles.sheet, { height: sheetHeight, transform: [{ translateY }] }]}>
          <View style={styles.handleArea} {...panResponder.panHandlers}>
            <View style={styles.handle} />
          </View>

          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('place.filters.quick._label')}</Text>
              <FilterChipGroup
                options={quickFilters.map((option) => ({ id: option.id, name: t(option.labelKey) }))}
                selected={[...selectedQuickFilters.countries, ...selectedQuickFilters.quickFeatures]}
                onToggle={(id) => {
                  if (id === 'KR' || id === 'JP') onToggleCountry(id);
                  else onToggleFeature(id);
                }}
              />
            </View>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('place.filters.regions._label')}</Text>
              {koreanRegions.length > 0 && (
                <RegionFilterGroup options={koreanRegions.map(option => ({ ...option, name: getRegionDisplayName(option) }))} selected={filters.regionIds} onToggle={onToggleRegion} />
              )}
              {koreanRegions.length > 0 && japaneseRegions.length > 0 && <View style={styles.regionDivider} />}
              {japaneseRegions.length > 0 && (
                <FilterChipGroup options={japaneseRegions.map(option => ({ ...option, name: getRegionDisplayName(option) }))} selected={filters.regionIds} onToggle={onToggleRegion} />
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('place.filters.interests._label')}</Text>
              <FilterChipGroup
                options={tags.map(option => ({ ...option, name: getTagDisplayName(option) }))}
                selected={filters.tagIds}
                onToggle={onToggleTag}
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('place.filters.operationStatuses._label')}</Text>
              <FilterChipGroup
                options={statusOptions}
                selected={filters.status ? [filters.status] : []}
                onToggle={onToggleStatus}
              />
            </View>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('place.detail.basicInfo.period')}</Text>
              <View style={styles.chipGroup}>
                {visitPeriodOptions.map((option) => {
                  const isCustom = option.id === 'custom';
                  const isSelected = period === option.id;
                  return (
                    <Pressable
                      key={option.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected, disabled: isCustom }}
                      disabled={isCustom}
                      onPress={() => { if (!isCustom) onPeriodChange(option.id); }}
                      style={[styles.chip, isSelected && styles.selectedChip]}
                    >
                      <Text numberOfLines={1} style={[styles.chipText, isSelected && styles.selectedChipText, isCustom && styles.disabledChipText]}>
                        {t(option.labelKey)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            {optionsStatus !== 'ready' && (
              <Text style={styles.optionsMessage}>
                {optionsStatus === 'loading' ? t('place.filters.loading') : t('place.filters.loadFailed')}
              </Text>
            )}
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.space16) }]}>
            <Pressable accessibilityRole="button" onPress={onReset} style={styles.resetButton}>
              <Text style={styles.resetText}>{t('place.filters.reset')}</Text>
            </Pressable>
            <View style={styles.applyButton}>
              <MoreButton label={t('place.filters.showPopups')} onPress={onApply} variant="primary" />
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  sheet: {
    overflow: 'hidden',
    borderTopLeftRadius: radius.radius24,
    borderTopRightRadius: radius.radius24,
    backgroundColor: colors.background,
  },
  handleArea: {
    height: 40,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: spacing.space12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.inactiveTabText,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: spacing.space16,
    paddingTop: spacing.space8,
    paddingBottom: spacing.space32,
    rowGap: spacing.space32,
  },
  section: {
    alignItems: 'center',
    rowGap: spacing.space16,
  },
  sectionTitle: {
    ...typography.titleS,
    color: colors.text,
    textAlign: 'center',
  },
  regionDivider: {
    width: '100%',
    height: 1,
    backgroundColor: colors.border,
  },
  chipGroup: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.space8,
  },
  chip: {
    minHeight: 36,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  selectedChip: {
    borderColor: colors.text,
    backgroundColor: colors.text,
  },
  chipText: {
    ...typography.label,
    color: colors.text,
  },
  selectedChipText: {
    color: colors.background,
  },
  disabledChipText: { color: colors.inactiveTabText },
  optionsMessage: { ...typography.label, color: colors.secondaryText, textAlign: 'center' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: spacing.space12,
    paddingTop: spacing.space12,
    paddingHorizontal: spacing.space16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  resetButton: {
    height: 48,
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetText: {
    ...typography.label,
    color: colors.text,
  },
  applyButton: {
    flex: 1,
  },
});
