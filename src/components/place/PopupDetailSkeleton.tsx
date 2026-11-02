import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import SkeletonBlock from '../common/SkeletonBlock';
import { radius, spacing } from '../../theme/tokens';

type PopupDetailSkeletonProps = {
  width: number;
  heroHeight: number;
  heroControls: ReactNode;
};

export default function PopupDetailSkeleton({ width, heroHeight, heroControls }: PopupDetailSkeletonProps) {
  return (
    <>
      <View style={styles.hero}>
        <SkeletonBlock width={width} height={heroHeight} borderRadius={0} />
        {heroControls}
      </View>
      <View style={styles.infoContent} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={styles.tags}>
          <SkeletonBlock width={62} height={24} borderRadius={radius.radius8} />
          <SkeletonBlock width={72} height={24} borderRadius={radius.radius8} />
          <SkeletonBlock width={54} height={24} borderRadius={radius.radius8} />
        </View>
        <SkeletonBlock width="75%" height={28} style={styles.title} />
        <View style={styles.infoSection}>
          {[0, 1, 2].map((row) => (
            <View key={row} style={[styles.infoRow, row > 0 && styles.nextInfoRow]}>
              <SkeletonBlock width={20} height={18} />
              <SkeletonBlock width={64} height={20} />
              <SkeletonBlock width="50%" height={20} />
            </View>
          ))}
        </View>
        <View style={styles.descriptionSection}>
          <View style={styles.divider} />
          <SkeletonBlock width={100} height={26} style={styles.sectionTitle} />
          <SkeletonBlock width="100%" height={22} style={styles.summaryLine} />
          <SkeletonBlock width="65%" height={22} style={styles.summaryLine} />
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  hero: { position: 'relative' },
  infoContent: { paddingTop: spacing.space24, paddingHorizontal: spacing.space16 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.space8 },
  title: { marginTop: spacing.space8 },
  infoSection: { marginTop: spacing.space24 },
  infoRow: { minHeight: 32, flexDirection: 'row', alignItems: 'center', columnGap: spacing.space8 },
  nextInfoRow: { marginTop: spacing.space4 },
  descriptionSection: { marginTop: spacing.space24 },
  divider: { height: 8, marginHorizontal: -spacing.space16, backgroundColor: '#F5F6F8' },
  sectionTitle: { marginTop: spacing.space24 },
  summaryLine: { marginTop: spacing.space16 },
});
