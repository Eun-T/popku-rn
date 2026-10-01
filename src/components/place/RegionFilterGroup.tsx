import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { regionFilters, type RegionId } from '../../constants/placeFilters';
import { t } from '../../locales';
import { colors, radius, spacing, typography } from '../../theme/tokens';

type RegionOption = (typeof regionFilters)[number];

type RegionFilterGroupProps = {
  options: readonly RegionOption[];
  selected: readonly RegionId[];
  onToggle: (id: RegionId) => void;
};

function getRowCount(widths: readonly number[], availableWidth: number): number {
  let rows = 1;
  let rowWidth = 0;

  for (const width of widths) {
    if (rowWidth === 0) {
      rowWidth = width;
    } else if (rowWidth + spacing.space8 + width <= availableWidth) {
      rowWidth += spacing.space8 + width;
    } else {
      rows += 1;
      rowWidth = width;
    }
  }

  return rows;
}

export default function RegionFilterGroup({ options, selected, onToggle }: RegionFilterGroupProps) {
  const [expanded, setExpanded] = useState(false);
  const [availableWidth, setAvailableWidth] = useState(0);
  const [chipWidths, setChipWidths] = useState<Record<string, number>>({});
  const [moreWidths, setMoreWidths] = useState<Record<number, number>>({});

  const measureWidth = (event: LayoutChangeEvent) => event.nativeEvent.layout.width;
  const allMeasured = availableWidth > 0
    && options.every((option) => chipWidths[option.id] > 0)
    && options.every((_, index) => moreWidths[index + 1] > 0);

  let visibleCount = options.length;
  if (allMeasured) {
    const widths = options.map((option) => chipWidths[option.id]);
    if (getRowCount(widths, availableWidth) > 2) {
      for (let count = options.length - 1; count >= 0; count -= 1) {
        const hiddenCount = options.length - count;
        const rowCount = getRowCount([...widths.slice(0, count), moreWidths[hiddenCount]], availableWidth);
        if (rowCount <= 2) {
          visibleCount = count;
          break;
        }
      }
    }
  }

  const hiddenCount = options.length - visibleCount;
  const visibleOptions = expanded ? options : options.slice(0, visibleCount);

  return (
    <View
      style={styles.container}
      onLayout={(event) => setAvailableWidth(event.nativeEvent.layout.width)}
    >
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.measurement}
      >
        {options.map((option) => (
          <View
            key={option.id}
            style={styles.chip}
            onLayout={(event) => {
              const width = measureWidth(event);
              setChipWidths((current) => current[option.id] === width
                ? current
                : { ...current, [option.id]: width });
            }}
          >
            <Text numberOfLines={1} style={styles.chipText}>{t(option.labelKey)}</Text>
          </View>
        ))}
        {options.map((_, index) => {
          const count = index + 1;
          return (
            <View
              key={`more-${count}`}
              style={[styles.chip, styles.actionChip]}
              onLayout={(event) => {
                const width = measureWidth(event);
                setMoreWidths((current) => current[count] === width
                  ? current
                  : { ...current, [count]: width });
              }}
            >
              <Text style={styles.chipText}>+{count}</Text>
              <ChevronDown size={16} color={colors.text} />
            </View>
          );
        })}
      </View>

      {allMeasured && (
        <View style={styles.chipGroup}>
          {visibleOptions.map((option) => {
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
                  {t(option.labelKey)}
                </Text>
              </Pressable>
            );
          })}

          {hiddenCount > 0 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={expanded
                ? t('place.filters.collapseRegions')
                : t('place.filters.moreRegions', { count: hiddenCount })}
              onPress={() => setExpanded((current) => !current)}
              style={[styles.chip, styles.actionChip]}
            >
              <Text style={styles.chipText}>{expanded ? t('place.filters.collapse') : `+${hiddenCount}`}</Text>
              {expanded
                ? <ChevronUp size={16} color={colors.text} />
                : <ChevronDown size={16} color={colors.text} />}
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  measurement: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.space8,
    opacity: 0,
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
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  chipText: {
    ...typography.label,
    color: colors.text,
  },
  selectedChipText: {
    color: colors.background,
  },
  actionChip: {
    flexDirection: 'row',
    columnGap: spacing.space4,
  },
});
