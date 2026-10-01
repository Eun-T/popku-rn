import { useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react-native';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { t } from '../../locales';
import { colors, radius, spacing, typography } from '../../theme/tokens';

const sortOptions = [
  { id: 'latest', labelKey: 'place.all.sort.latest' },
  { id: 'popular', labelKey: 'place.all.sort.popular' },
] as const;

const periodOptions = [
  { id: 'all', labelKey: 'place.all.period.all' },
  { id: 'today', labelKey: 'place.all.period.today' },
  { id: 'week', labelKey: 'place.all.period.week' },
  { id: 'weekend', labelKey: 'place.all.period.weekend' },
  { id: 'custom', labelKey: 'place.all.period.custom' },
] as const;

export type PlaceSort = (typeof sortOptions)[number]['id'];
export type VisitPeriod = Exclude<(typeof periodOptions)[number]['id'], 'custom'>;

type PlaceAllToolbarProps = {
  sort: PlaceSort;
  onSortChange: (sort: PlaceSort) => void;
  period: VisitPeriod;
  onPeriodChange: (period: VisitPeriod) => void;
};

export default function PlaceAllToolbar({
  sort,
  onSortChange,
  period,
  onPeriodChange,
}: PlaceAllToolbarProps) {
  const [isPeriodMenuOpen, setPeriodMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });
  const periodButtonRef = useRef<View>(null);
  const { width } = useWindowDimensions();
  const selectedPeriod = periodOptions.find((option) => option.id === period);

  const openPeriodMenu = () => {
    periodButtonRef.current?.measureInWindow((x, y, buttonWidth, buttonHeight) => {
      setMenuPosition({
        top: y + buttonHeight + spacing.space8,
        right: Math.max(0, width - x - buttonWidth),
      });
      setPeriodMenuOpen(true);
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.sortOptions}>
          {sortOptions.map((option) => {
            const isSelected = sort === option.id;
            return (
              <Pressable
                key={option.id}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                onPress={() => onSortChange(option.id)}
              >
                <Text style={[styles.sortText, isSelected && styles.selectedSortText]}>
                  {t(option.labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          ref={periodButtonRef}
          accessibilityRole="button"
          accessibilityState={{ expanded: isPeriodMenuOpen }}
          onPress={openPeriodMenu}
          style={styles.periodButton}
        >
          <Text style={styles.periodText}>{t(selectedPeriod?.labelKey ?? 'place.all.period.all')}</Text>
          <ChevronDown size={16} color={colors.text} />
        </Pressable>
      </View>

      <Modal
        visible={isPeriodMenuOpen}
        transparent
        animationType="none"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setPeriodMenuOpen(false)}
      >
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPeriodMenuOpen(false)} />
          <View style={[styles.menu, menuPosition]}>
            {periodOptions.map((option) => {
              const isCustom = option.id === 'custom';
              const isSelected = period === option.id;
              return (
                <Pressable
                  key={option.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected, disabled: isCustom }}
                  disabled={isCustom}
                  onPress={() => {
                    if (!isCustom) {
                      onPeriodChange(option.id);
                      setPeriodMenuOpen(false);
                    }
                  }}
                  style={styles.menuItem}
                >
                  <Text style={[styles.menuText, isSelected && styles.selectedMenuText, isCustom && styles.disabledMenuText]}>
                    {t(option.labelKey)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.space24,
  },
  row: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sortOptions: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: spacing.space16,
  },
  sortText: {
    ...typography.label,
    color: colors.secondaryText,
  },
  selectedSortText: {
    fontWeight: '700',
    color: colors.text,
  },
  periodButton: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: spacing.space4,
    paddingHorizontal: spacing.space12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    backgroundColor: colors.background,
  },
  periodText: {
    ...typography.label,
    color: colors.text,
  },
  overlay: {
    flex: 1,
  },
  menu: {
    position: 'absolute',
    minWidth: 160,
    padding: spacing.space4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.radius12,
    backgroundColor: colors.background,
  },
  menuItem: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.space12,
  },
  menuText: {
    ...typography.label,
    color: colors.text,
  },
  selectedMenuText: {
    fontWeight: '700',
    color: colors.primaryDark,
  },
  disabledMenuText: {
    color: colors.inactiveTabText,
  },
});
