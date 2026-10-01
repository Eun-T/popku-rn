import { StyleSheet, View } from 'react-native';

import SkeletonBlock from '../common/SkeletonBlock';
import { radius, spacing } from '../../theme/tokens';

type PopupGridSkeletonProps = { cardWidth: number };

function PopupGridSkeletonCard({ width }: { width: number }) {
  return (
    <View style={{ width }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <SkeletonBlock width="100%" height={width * 5 / 4} borderRadius={radius.radius8} />
      <SkeletonBlock width={88} height={26} style={styles.badge} />
      <SkeletonBlock width="85%" height={20} style={styles.title} />
      <View style={styles.locationAndTag}>
        <SkeletonBlock width="43%" height={18} />
        <SkeletonBlock width="38%" height={18} />
      </View>
      <SkeletonBlock width="65%" height={18} style={styles.period} />
    </View>
  );
}

export default function PopupGridSkeleton({ cardWidth }: PopupGridSkeletonProps) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {[0, 1].map((row) => (
        <View key={row} style={[styles.row, row > 0 && styles.nextRow]}>
          <PopupGridSkeletonCard width={cardWidth} />
          <PopupGridSkeletonCard width={cardWidth} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', columnGap: spacing.space12, alignItems: 'flex-start' },
  nextRow: { marginTop: spacing.space24 },
  badge: { marginTop: spacing.space8 },
  title: { marginTop: spacing.space6 },
  locationAndTag: { flexDirection: 'row', columnGap: spacing.space4, marginTop: spacing.space8 },
  period: { marginTop: spacing.space6 },
});
