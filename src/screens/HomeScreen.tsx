import { ScrollView, StyleSheet, View } from 'react-native';

import { usePopupNavigation } from '../hooks/usePopupNavigation';

import HomeBanner from '../components/home/HomeBanner';
import HomeNewPopupSection from '../components/home/HomeNewPopupSection';
import HomeTrendingSection from '../components/home/HomeTrendingSection';
import { FLOATING_TAB_BAR_BOTTOM_GAP, FLOATING_TAB_BAR_HEIGHT } from '../components/navigation/FloatingTabBar';
import { colors, spacing } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

export default function HomeScreen() {
  const openPopup = usePopupNavigation();
  const { themeColors } = useTheme();
  return (
    <ScrollView style={[styles.container, { backgroundColor: themeColors.background }]} contentContainerStyle={styles.content}>
      <HomeBanner onPressPopup={openPopup} />
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
  newPopupSection: {
    marginTop: spacing.space56,
    marginBottom: spacing.space56,
  },
});
