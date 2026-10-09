import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing, typography } from "../../theme/tokens";
import type { ThemeColors } from '../../theme/themeColors';

type FilterOption<T extends string> = {
  label: string;
  value: T;
};

type FilterChipsProps<T extends string> = {
  options: readonly FilterOption<T>[];
  value: T;
  onChange: (value: T) => void;
  themeColors?: ThemeColors;
};

export default function FilterChips<T extends string>({
  options,
  value,
  onChange,
  themeColors,
}: FilterChipsProps<T>) {
  return (
    <View style={styles.filters}>
      {options.map((option) => {
        const isSelected = option.value === value;

        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            onPress={() => onChange(option.value)}
            style={[styles.filter, isSelected && styles.selectedFilter, themeColors && {
              backgroundColor: isSelected ? themeColors.filterSelectedBg : themeColors.filterUnselectedBg,
              borderColor: isSelected ? themeColors.filterSelectedBg : themeColors.border,
            }]}
          >
            <Text
              style={[
                styles.filterText,
                isSelected && styles.selectedFilterText,
                themeColors && { color: isSelected ? themeColors.filterSelectedText : themeColors.filterUnselectedText },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  filters: {
    flexDirection: "row",
    columnGap: spacing.space8,
  },
  filter: {
    height: 36,
    paddingHorizontal: spacing.space16,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  selectedFilter: {
    borderColor: colors.text,
    backgroundColor: colors.text,
  },
  filterText: {
    ...typography.label,
    color: colors.text,
  },
  selectedFilterText: {
    color: colors.background,
  },
});
