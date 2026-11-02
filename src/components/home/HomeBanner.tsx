import { useId, useRef, useState } from "react";
import { Image } from "expo-image";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { useHomeMainBanners } from "../../hooks/useHomeMainBanners";
import type { MainBannerPopup } from "../../lib/mainBanners";
import { radius, spacing, typography } from "../../theme/tokens";
import { formatPopupPeriod } from "./HomeNewPopupSection";

type Props = {
  onPressPopup: (id: string) => void;
};

function BannerImage({ popup }: { popup: MainBannerPopup }) {
  const [failed, setFailed] = useState(false);
  if (!popup.coverImageUrl || failed) return null;
  return (
    <Image
      source={{
        uri: popup.coverImageUrl,
        ...(popup.coverImageCacheKey
          ? { cacheKey: popup.coverImageCacheKey }
          : {}),
      }}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      contentPosition={{
        left: `${popup.bannerPositionX}%`,
        top: `${popup.bannerPositionY}%`,
      }}
      cachePolicy="memory-disk"
      onError={() => setFailed(true)}
    />
  );
}

function BannerCard({
  popup,
  width,
  onPressPopup,
}: Props & { popup: MainBannerPopup; width: number }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const period = formatPopupPeriod(popup.startDate, popup.endDate);
  return (
    <Pressable
      style={[styles.card, { width }]}
      accessibilityRole="button"
      accessibilityLabel={popup.name}
      onPress={() => onPressPopup(popup.publicId)}
    >
      <BannerImage
        key={`${popup.coverImageUrl}:${popup.coverImageCacheKey}`}
        popup={popup}
      />
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id={`${id}-card`} x1="0%" y1="0%" x2="0%" y2="100%">
              <Stop offset="25%" stopColor="#000000" stopOpacity={0} />
              <Stop offset="58%" stopColor="#000000" stopOpacity={0.45} />
              <Stop offset="100%" stopColor="#000000" stopOpacity={0.9} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill={`url(#${id}-card)`} />
        </Svg>
      </View>
      <View pointerEvents="none" style={styles.info}>
        {period ? (
          <Text style={styles.date} numberOfLines={1} ellipsizeMode="tail">
            {period}
          </Text>
        ) : null}
        <Text style={styles.title} numberOfLines={2} ellipsizeMode="tail">
          {popup.name}
        </Text>
      </View>
    </Pressable>
  );
}

function BannerPages({
  popups,
  width,
  onPressPopup,
}: Props & { popups: MainBannerPopup[]; width: number }) {
  const scrollRef = useRef<ScrollView>(null);
  const cardWidth = Math.max(0, width - spacing.space16 * 2);
  const interval = cardWidth + spacing.space12;
  const canLoop = popups.length > 1;
  // Start in the middle copy so both neighbours are visible, even with two cards.
  const initialOffset = canLoop ? popups.length * interval : 0;
  const slides = Array.from({ length: canLoop ? 3 : 1 }, (_, copy) =>
    popups.map((popup) => ({ popup, key: `${popup.publicId}:${copy}` })),
  ).flat();

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      style={styles.viewport}
      contentContainerStyle={styles.track}
      contentOffset={{ x: initialOffset, y: 0 }}
      scrollEnabled={canLoop}
      showsHorizontalScrollIndicator={false}
      snapToInterval={interval}
      snapToAlignment="start"
      decelerationRate="fast"
      disableIntervalMomentum
      directionalLockEnabled
      bounces={false}
      contentInsetAdjustmentBehavior="never"
      onMomentumScrollEnd={({ nativeEvent }) => {
        if (!canLoop) return;
        const index = Math.round(nativeEvent.contentOffset.x / interval);
        if (index < popups.length || index >= popups.length * 2) {
          // Recenter only after scrolling stops; the visible card stays identical.
          const middleIndex = popups.length + (index % popups.length);
          scrollRef.current?.scrollTo({ x: middleIndex * interval, animated: false });
        }
      }}
    >
      {slides.map(({ popup, key }) => (
        <BannerCard
          key={key}
          popup={popup}
          width={cardWidth}
          onPressPopup={onPressPopup}
        />
      ))}
    </ScrollView>
  );
}

export default function HomeBanner({ onPressPopup }: Props) {
  const { status, popups } = useHomeMainBanners();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const top = insets.top + spacing.space12;
  if (status === "loading") {
    return <View style={{ height: top + Math.max(0, width - spacing.space16 * 2) }} />;
  }
  if (status === "error" || popups.length === 0) return null;
  return (
    <View style={{ paddingTop: top }}>
      <BannerPages
        key={`${width}:${popups.map((popup) => popup.publicId).join(",")}`}
        popups={popups}
        width={width}
        onPressPopup={onPressPopup}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: { width: "100%", flexGrow: 0 },
  track: { paddingHorizontal: spacing.space16, columnGap: spacing.space12 },
  card: {
    aspectRatio: 1,
    borderRadius: radius.radius8,
    overflow: "hidden",
    backgroundColor: "#374151",
  },
  info: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.space16,
    paddingTop: spacing.space16,
    paddingBottom: spacing.space24,
  },
  date: {
    ...typography.label,
    fontSize: 17,
    lineHeight: 24,
    color: "rgba(255,255,255,0.85)",
    marginBottom: spacing.space2,
  },
  title: {
    ...typography.titleM,
    fontSize: 21,
    color: "#FFFFFF",
  },
});
