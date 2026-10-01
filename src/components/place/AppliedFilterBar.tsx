import { X } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  operationStatusFilters,
  quickFilters,
  type PlaceFilterState,
} from '../../constants/placeFilters';
import type { AppliedPopupFilters, PopupRegionOption, PopupTagOption } from '../../lib/popups';
import { t } from '../../locales';
import { colors, radius, spacing, typography } from '../../theme/tokens';

type FilterGroup = 'countries' | 'quickFeatures' | 'regionIds' | 'tagIds' | 'status';

type AppliedFilter = {
  group: FilterGroup;
  id: string | number;
  label: string;
};

type AppliedFilterBarProps = {
  filters: PlaceFilterState;
  detailFilters: AppliedPopupFilters;
  regions: readonly PopupRegionOption[];
  tags: readonly PopupTagOption[];
  onRemove: (group: FilterGroup, id: string | number) => void;
  onReset: () => void;
};

export default function AppliedFilterBar({ filters, detailFilters, regions, tags, onRemove, onReset }: AppliedFilterBarProps) {
  const chips: AppliedFilter[] = [
    ...quickFilters
      .filter((option) => option.group === 'countries'
        ? filters.countries.includes(option.id)
        : filters.quickFeatures.includes(option.id))
      .map(({ group, id, labelKey }) => ({ group, id, label: t(labelKey) })),
    ...regions
      .filter((option) => detailFilters.regionIds.includes(option.id))
      .map(({ id, name }) => ({ group: 'regionIds' as const, id, label: name })),
    ...tags
      .filter((option) => detailFilters.tagIds.includes(option.id))
      .map(({ id, name }) => ({ group: 'tagIds' as const, id, label: name })),
    ...operationStatusFilters
      .filter((option) => ({ open: 'ONGOING', upcoming: 'UPCOMING', closed: 'ENDED' })[option.id] === detailFilters.status)
      .map(({ id, labelKey }) => ({ group: 'status' as const, id, label: t(labelKey) })),
  ];

  if (chips.length === 0) return null;

  return (
    <View style={styles.row}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scrollArea}
        contentContainerStyle={styles.chips}
      >
        {chips.map((chip) => (
          <View key={`${chip.group}-${chip.id}`} style={styles.chip}>
            <Text numberOfLines={1} style={styles.chipText}>{chip.label}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('place.filters.remove', { label: chip.label })}
              hitSlop={spacing.space6}
              onPress={() => onRemove(chip.group, chip.id)}
            >
              <X size={14} color={colors.primaryDark} />
            </Pressable>
          </View>
        ))}
      </ScrollView>

      <View style={styles.resetArea}>
        <View style={styles.divider} />
        <Pressable accessibilityRole="button" onPress={onReset} style={styles.resetButton}>
          <Text style={styles.resetText}>{t('place.filters.resetAll')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.space16,
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
    backgroundColor: colors.primaryLight,
  },
  chipText: {
    ...typography.label,
    color: colors.primaryDark,
  },
  resetArea: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: spacing.space8,
    paddingLeft: spacing.space8,
    backgroundColor: colors.background,
  },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: colors.border,
  },
  resetButton: {
    height: 36,
    paddingHorizontal: spacing.space8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetText: {
    ...typography.label,
    color: colors.text,
  },
});
