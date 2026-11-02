import { useScrollToTop } from "expo-router";
import { useRef } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";

import { usePopupNavigation } from "../hooks/usePopupNavigation";

import HomeBanner from "../components/home/HomeBanner";
import HomeLatestPopupSection from "../components/home/HomeLatestPopupSection";
import HomeJapanNewPopupSection, { type JapanNewSectionHandle } from "../components/home/HomeJapanNewPopupSection";
import HomeTrendingSection from "../components/home/HomeTrendingSection";
import HomeSeoulMapSection, { type HomeSeoulMapHandle } from "../components/home/HomeSeoulMapSection";
import {
  FLOATING_TAB_BAR_BOTTOM_GAP,
  FLOATING_TAB_BAR_HEIGHT,
} from "../components/navigation/FloatingTabBar";
import { colors, spacing } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

export default function HomeScreen() {
  const scrollRef = useRef<ScrollView>(null);
  const seoulMapRef = useRef<HomeSeoulMapHandle>(null);
  const japanNewRef = useRef<JapanNewSectionHandle>(null);
  useScrollToTop(scrollRef);
  const openPopup = usePopupNavigation();
  const { themeColors } = useTheme();
  return (
    <Animated.ScrollView
      ref={scrollRef}
      style={[styles.container, { backgroundColor: themeColors.background }]}
      contentContainerStyle={styles.content}
      scrollEventThrottle={100}
      onScroll={() => { seoulMapRef.current?.checkVisibility(); japanNewRef.current?.checkVisibility(); }}
      onContentSizeChange={() => { seoulMapRef.current?.checkVisibility(); japanNewRef.current?.checkVisibility(); }}
    >
      <HomeBanner onPressPopup={openPopup} />
      <HomeLatestPopupSection onPressPopup={openPopup} />
      <HomeTrendingSection onPressPopup={openPopup} />
      <HomeSeoulMapSection ref={seoulMapRef} />
      <View style={styles.newPopupSection}>
        <HomeJapanNewPopupSection ref={japanNewRef} onPressPopup={openPopup} />
      </View>
    </Animated.ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom:
      FLOATING_TAB_BAR_HEIGHT + FLOATING_TAB_BAR_BOTTOM_GAP + spacing.space40,
  },
  newPopupSection: {
    marginTop: spacing.space48,
  },
});
