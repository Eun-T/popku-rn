import { ChevronDown } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { quickFilters, type PlaceFilterState, type CountryCode, type QuickFeatureId } from '../../constants/placeFilters';
import { t } from '../../locales';
import { colors, radius, spacing, typography } from '../../theme/tokens';

type QuickFilterBarProps = {
  selectedFilters: PlaceFilterState;
  onToggleCountry: (country: CountryCode) => void;
  onToggleFeature: (feature: QuickFeatureId) => void;
  onOpenDetails: () => void;
};

export default function QuickFilterBar({
  selectedFilters,
  onToggleCountry,
  onToggleFeature,
  onOpenDetails,
}: QuickFilterBarProps) {
  return (
    <View style={styles.row}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scrollArea}
        contentContainerStyle={styles.chips}
      >
        {quickFilters.map((filter) => {
          const isSelected = filter.group === 'countries'
            ? selectedFilters.countries.includes(filter.id)
            : selectedFilters.quickFeatures.includes(filter.id);

          return (
            <Pressable
              key={filter.id}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              onPress={() => filter.group === 'countries'
                ? onToggleCountry(filter.id)
                : onToggleFeature(filter.id)}
              style={[styles.chip, isSelected && styles.selectedChip]}
            >
              <Text
                numberOfLines={1}
                style={[styles.chipText, isSelected && styles.selectedChipText]}
              >
                {t(filter.labelKey)}
              </Text>
            </Pressable>
          );
        })}
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
  detailArea: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: spacing.space12,
  },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: colors.border,
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
