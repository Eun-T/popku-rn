import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';

import { usePopupNavigation } from '../hooks/usePopupNavigation';

import HomeBanner from '../components/home/HomeBanner';
import HomeNewPopupSection from '../components/home/HomeNewPopupSection';
import HomeTrendingSection from '../components/home/HomeTrendingSection';
import { FLOATING_TAB_BAR_BOTTOM_GAP, FLOATING_TAB_BAR_HEIGHT } from '../components/navigation/FloatingTabBar';
import { colors, spacing } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

// Experimental UI: set false to restore the original scroll and banner behavior.
const ENABLE_BANNER_STRETCH = true;
const HomeScrollView = ENABLE_BANNER_STRETCH ? Animated.ScrollView : ScrollView;

type BannerScrollContext = {
  isDragging: boolean;
  startedAtTop: boolean;
  previousY: number;
  isStretching: boolean;
};

export default function HomeScreen() {
  const openPopup = usePopupNavigation();
  const { themeColors } = useTheme();
  const bannerPullDistance = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler<BannerScrollContext>({
    onBeginDrag: (event, context) => {
      const y = event.contentOffset.y;
      context.isDragging = true;
      context.startedAtTop = y <= 0;
      context.previousY = y;
      // Preserve the return of an already active pull if its bounce is interrupted.
      context.isStretching = y < 0 && bannerPullDistance.value > 0;
    },
    onEndDrag: (_event, context) => {
      context.isDragging = false;
      context.startedAtTop = false;
    },
    onScroll: (event, context) => {
      const y = event.contentOffset.y;
      if (y >= 0) context.isStretching = false;
      // Entering the content disqualifies this drag, even if it later returns to the top.
      if (y > 0) context.startedAtTop = false;
      if (context.isDragging && context.startedAtTop && y < 0 && y < context.previousY) {
        context.isStretching = true;
      }
      context.previousY = y;
      // Only an accepted pull may follow the native bounce after release.
      const distance = context.isStretching ? Math.max(0, -y) : 0;
      if (bannerPullDistance.value !== distance) bannerPullDistance.value = distance;
    },
  });
  return (
    <HomeScrollView
      style={[styles.container, { backgroundColor: themeColors.background }]}
      contentContainerStyle={styles.content}
      onScroll={ENABLE_BANNER_STRETCH ? onScroll : undefined}
      scrollEventThrottle={ENABLE_BANNER_STRETCH ? 16 : undefined}
    >
      <HomeBanner onPressPopup={openPopup} pullDistance={ENABLE_BANNER_STRETCH ? bannerPullDistance : undefined} />
      <HomeTrendingSection onPressPopup={openPopup} />
      <View style={styles.newPopupSection}>
        <HomeNewPopupSection onPressPopup={openPopup} />
      </View>
    </HomeScrollView>
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
