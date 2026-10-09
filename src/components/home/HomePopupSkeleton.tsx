import { StyleSheet, View } from 'react-native';

import SkeletonBlock from '../common/SkeletonBlock';
import { colors, radius, spacing } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';

export function HomeTrendingSkeleton() {
  return <>{Array.from({ length: 5 }, (_, index) => <RankingSkeletonCard key={index} />)}</>;
}

function RankingSkeletonCard() {
  const { themeColors } = useTheme();
  return (
    <View style={[styles.rankingCard, { backgroundColor: themeColors.cardBackground, borderBottomColor: themeColors.border }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <SkeletonBlock backgroundColor={themeColors.skeletonBackground} width={88} height={108} borderRadius={radius.radius8} />
      <View style={styles.rankingContent}>
        <SkeletonBlock backgroundColor={themeColors.skeletonBackground} width="85%" height={24} />
        <SkeletonBlock backgroundColor={themeColors.skeletonBackground} width="70%" height={18} style={styles.rankingPeriod} />
        <View style={styles.rankingTags}>
          <SkeletonBlock backgroundColor={themeColors.skeletonBackground} width={64} height={26} />
          <SkeletonBlock backgroundColor={themeColors.skeletonBackground} width={48} height={26} />
        </View>
      </View>
      <SkeletonBlock backgroundColor={themeColors.skeletonBackground} width={22} height={22} borderRadius={radius.full} style={styles.rankingFavorite} />
    </View>
  );
}

export function HomeNewPopupSkeleton({ width }: { width: number }) {
  return <>{Array.from({ length: 3 }, (_, index) => <NewPopupSkeletonCard key={index} width={width} />)}</>;
}

function NewPopupSkeletonCard({ width }: { width: number }) {
  const { themeColors } = useTheme();
  return (
    <View style={{ width }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <SkeletonBlock backgroundColor={themeColors.skeletonBackground} width={width} height={width} borderRadius={radius.radius4} />
      <SkeletonBlock backgroundColor={themeColors.skeletonBackground} width={96} height={26} style={styles.newBadge} />
      <View style={styles.newTitle}>
        <SkeletonBlock backgroundColor={themeColors.skeletonBackground} width="90%" height={18} />
        <SkeletonBlock backgroundColor={themeColors.skeletonBackground} width="60%" height={18} />
      </View>
      <View style={styles.newTags}>
        <SkeletonBlock backgroundColor={themeColors.skeletonBackground} width={64} height={26} />
        <SkeletonBlock backgroundColor={themeColors.skeletonBackground} width={48} height={26} />
      </View>
    </View>
  );
}

export function RankingSkeletonFooter() {
  const { themeColors } = useTheme();
  return <SkeletonBlock backgroundColor={themeColors.skeletonBackground} width="100%" height={48} borderRadius={radius.radius12} />;
}

const styles = StyleSheet.create({
  rankingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.space12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  rankingContent: {
    flex: 1,
    minWidth: 0,
    marginLeft: spacing.space20,
  },
  rankingPeriod: {
    marginTop: spacing.space8,
  },
  rankingTags: {
    flexDirection: 'row',
    gap: spacing.space4,
    marginTop: spacing.space8,
  },
  rankingFavorite: {
    marginHorizontal: 11,
  },
  newBadge: {
    marginTop: spacing.space8,
  },
  newTitle: {
    height: 48,
    marginTop: spacing.space8,
    justifyContent: 'space-around',
  },
  newTags: {
    flexDirection: 'row',
    gap: spacing.space4,
    marginTop: spacing.space8,
  },
});
