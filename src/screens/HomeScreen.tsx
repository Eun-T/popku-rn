import { ScrollView, StyleSheet, View } from 'react-native';

import { usePopupNavigation } from '../hooks/usePopupNavigation';

import HomeBanner from '../components/home/HomeBanner';
import HomeNewPopupSection from '../components/home/HomeNewPopupSection';
import HomeQuickMenu from '../components/home/HomeQuickMenu';
import HomeTrendingSection from '../components/home/HomeTrendingSection';
import { FLOATING_TAB_BAR_BOTTOM_GAP, FLOATING_TAB_BAR_HEIGHT } from '../components/navigation/FloatingTabBar';
import { colors, spacing } from '../theme/tokens';

export default function HomeScreen() {
  const openPopup = usePopupNavigation();
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <HomeBanner />
      <View style={styles.quickMenuSection}>
        <HomeQuickMenu />
      </View>
      <HomeTrendingSection onPressPopup={openPopup} />
      <View style={styles.newPopupSection}>
        <HomeNewPopupSection onPressPopup={openPopup} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: FLOATING_TAB_BAR_HEIGHT + FLOATING_TAB_BAR_BOTTOM_GAP + spacing.space40,
  },
  quickMenuSection: {
    marginTop: spacing.space16,
    marginBottom: spacing.space32,
  },
  newPopupSection: {
    marginTop: spacing.space56,
    marginBottom: spacing.space56,
  },
});
