import { getRegionDisplayName, getTagDisplayName } from '../../locales/filterLabels';
import { useTranslation } from '../../hooks/useTranslation';
import { ChevronDown, RotateCcw, X } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  operationStatusFilters,
  quickFilters,
  visitPeriodOptions,
  type VisitPeriod,
  type PlaceFilterState,
} from '../../constants/placeFilters';
import type { AppliedPopupFilters, PopupRegionOption, PopupTagOption } from '../../lib/popups';
import { t } from '../../locales';
import { colors, radius, spacing, typography } from '../../theme/tokens';

type FilterGroup = 'countries' | 'quickFeatures' | 'regionIds' | 'tagIds' | 'status' | 'period' | 'openingWeek';

type AppliedFilter = {
  group: FilterGroup;
  id: string | number;
  label: string;
};

type AppliedFilterBarProps = {
  filters: PlaceFilterState;
  detailFilters: AppliedPopupFilters;
  period: VisitPeriod;
  regions: readonly PopupRegionOption[];
  tags: readonly PopupTagOption[];
  onRemove: (group: FilterGroup, id: string | number) => void;
  onReset: () => void;
  onOpenDetails: () => void;
};

export default function AppliedFilterBar({ filters, detailFilters, period, regions, tags, onRemove, onReset, onOpenDetails }: AppliedFilterBarProps) {
  useTranslation();
  const chips: AppliedFilter[] = [
    ...(detailFilters.openingFrom && detailFilters.openingTo
      ? [{ group: 'openingWeek' as const, id: 'openingWeek', label: t('place.all.openingWeek') }] : []),
    ...quickFilters
      .filter((option) => option.group === 'countries'
        ? filters.countries.includes(option.id)
        : filters.quickFeatures.includes(option.id))
      .map(({ group, id, labelKey }) => ({ group, id, label: t(labelKey) })),
    ...detailFilters.regionIds
      .map((id) => ({ group: 'regionIds' as const, id, label: getRegionDisplayName(regions.find((option) => option.id === id) ?? { id, name: String(id) }) })),
    ...detailFilters.tagIds
      .map((id) => ({ group: 'tagIds' as const, id, label: getTagDisplayName(tags.find((option) => option.id === id) ?? { id, name: String(id) }) })),
    ...operationStatusFilters
      .filter((option) => ({ open: 'ONGOING', upcoming: 'UPCOMING', closed: 'ENDED' })[option.id] === detailFilters.status)
      .map(({ id, labelKey }) => ({ group: 'status' as const, id, label: t(labelKey) })),
    ...visitPeriodOptions
      .filter((option) => period !== 'all' && option.id === period)
      .map(({ id, labelKey }) => ({ group: 'period' as const, id, label: t(labelKey) })),
  ];

  if (chips.length === 0) return null;

  return (
    <View style={styles.row}>
      <Pressable accessibilityRole="button" onPress={onReset} hitSlop={{ right: spacing.space8 }} style={styles.resetButton}>
        <RotateCcw size={14} color={colors.secondaryText} strokeWidth={2.5} />
        <Text style={styles.resetText}>{t('place.filters.reset')}</Text>
      </Pressable>
      <Text accessible={false} style={styles.resetSeparator}>·</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scrollArea}
        contentContainerStyle={styles.chips}
      >
        {chips.map((chip) => (
          <View key={`${chip.group}-${chip.id}`} style={styles.chip}>
            <View pointerEvents="none" style={styles.chipBorder} />
            <Text numberOfLines={1} style={styles.chipText}>{chip.label}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('place.filters.remove', { label: chip.label })}
              hitSlop={spacing.space6}
              onPress={() => onRemove(chip.group, chip.id)}
            >
              <X size={14} color={colors.secondaryText} />
            </Pressable>
          </View>
        ))}
      </ScrollView>

      <View style={styles.detailArea}>
        <View style={styles.divider} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('place.filters.details')}
          onPress={onOpenDetails}
          style={styles.detailButton}
        >
          <ChevronDown size={20} color={colors.text} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scrollArea: {
    flex: 1,
  },
  chips: {
    alignItems: 'center',
    columnGap: spacing.space8,
    paddingRight: spacing.space16,
  },
  chip: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: spacing.space4,
    paddingHorizontal: spacing.space12,
    borderRadius: radius.full,
    backgroundColor: '#F0FDF4',
  },
  chipBorder: {
    ...StyleSheet.absoluteFill,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: radius.full,
  },
  chipText: {
    ...typography.label,
    color: colors.primaryDark,
  },
  detailArea: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: spacing.space8,
    columnGap: spacing.space12,
  },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: colors.border,
  },
  resetButton: {
    height: 36,
    paddingLeft: spacing.space8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: spacing.space4,
  },
  resetText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.secondaryText,
  },
  resetSeparator: {
    marginHorizontal: spacing.space6,
    color: '#D1D5DB',
  },
  detailButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
});
