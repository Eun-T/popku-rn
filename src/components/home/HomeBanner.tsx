import { useTranslation } from '../../hooks/useTranslation';
import { getPopupRegionDisplayName } from '../../locales/filterLabels';
import { useId, useState } from "react";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
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
import { colors, radius, spacing, typography } from "../../theme/tokens";
import { formatPopupPeriod } from "./HomeNewPopupSection";
import { useTheme } from '../../theme/useTheme';

const BANNER_HEIGHT = 380;
const FOOTER_GRADIENT_TOP = BANNER_HEIGHT * 0.5;
const POSTER_WIDTH_RATIO = 0.7;
type Props = { onPressPopup: (id: string) => void };

function BannerBackground({ popup }: { popup: MainBannerPopup }) {
  const { themeColors } = useTheme();
  const [failed, setFailed] = useState(false);
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.background, { backgroundColor: themeColors.bannerFallback }]}
    >
      {popup.coverImageUrl && !failed ? (
        <Image
          source={{
            uri: popup.coverImageUrl,
            ...(popup.coverImageCacheKey
              ? { cacheKey: popup.coverImageCacheKey }
              : {}),
          }}
          style={styles.backgroundImage}
          contentFit="cover"
          blurRadius={50}
          cachePolicy="memory-disk"
          onError={() => setFailed(true)}
        />
      ) : null}
      <View style={[StyleSheet.absoluteFill, styles.backgroundShade]} />
    </View>
  );
}

function BannerFooterGradient({ width }: { width: number }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={width} height={BANNER_HEIGHT}>
        <Defs>
          <LinearGradient
            id={`${id}-footer`}
            gradientUnits="userSpaceOnUse"
            x1={0}
            y1={FOOTER_GRADIENT_TOP}
            x2={0}
            y2={BANNER_HEIGHT}
          >
            <Stop offset="0" stopColor="#000000" stopOpacity={0} />
            <Stop
              offset={
                (BANNER_HEIGHT * 0.62 - FOOTER_GRADIENT_TOP) /
                (BANNER_HEIGHT - FOOTER_GRADIENT_TOP)
              }
              stopColor="#000000"
              stopOpacity={0.15}
            />
            <Stop
              offset={
                (BANNER_HEIGHT * 0.76 - FOOTER_GRADIENT_TOP) /
                (BANNER_HEIGHT - FOOTER_GRADIENT_TOP)
              }
              stopColor="#000000"
              stopOpacity={0.4}
            />
            <Stop offset="1" stopColor="#000000" stopOpacity={0.8} />
          </LinearGradient>
        </Defs>
        <Rect
          y={FOOTER_GRADIENT_TOP}
          width={width}
          height={BANNER_HEIGHT - FOOTER_GRADIENT_TOP}
          fill={`url(#${id}-footer)`}
        />
      </Svg>
    </View>
  );
}

function BannerImage({
  popup,
  width,
  height,
}: {
  popup: MainBannerPopup;
  width: number;
  height: number;
}) {
  const [failed, setFailed] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(1);
  if (!popup.coverImageUrl || failed || width <= 0 || height <= 0) return null;
  const posterWidth = Math.min(width, height * aspectRatio);
  const posterHeight = posterWidth / aspectRatio;
  return (
    <View
      style={[
        styles.posterShadow,
        { width: posterWidth, height: posterHeight },
      ]}
    >
      <Image
        source={{
          uri: popup.coverImageUrl,
          ...(popup.coverImageCacheKey
            ? { cacheKey: popup.coverImageCacheKey }
            : {}),
        }}
        style={styles.poster}
        contentFit="contain"
        cachePolicy="memory-disk"
        onLoad={({ source }) => {
          const ratio = source.width / source.height;
          if (Number.isFinite(ratio) && ratio > 0) setAspectRatio(ratio);
        }}
        onError={() => setFailed(true)}
      />
    </View>
  );
}

function BannerPages({
  popups,
  width,
  onPressPopup,
}: Props & { popups: MainBannerPopup[]; width: number }) {
  const { resolvedLanguage } = useTranslation();
  const { themeColors } = useTheme();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(0);
  const posterTop = insets.top + spacing.space12;
  const posterWidth = Math.max(
    0,
    Math.min(
      width * POSTER_WIDTH_RATIO,
      width - insets.left - insets.right - spacing.space32,
    ),
  );
  const posterHeight = Math.max(0, BANNER_HEIGHT - posterTop - spacing.space16);
  return (
    <View style={{ ...styles.banner, backgroundColor: themeColors.surface }}>
      <ScrollView
        horizontal
        pagingEnabled
        scrollEnabled={popups.length > 1}
        showsHorizontalScrollIndicator={false}
        style={{ ...styles.banner, backgroundColor: themeColors.surface }}
        onMomentumScrollEnd={({ nativeEvent }) => {
          setPage(
            Math.max(
              0,
              Math.min(
                popups.length - 1,
                Math.round(nativeEvent.contentOffset.x / width),
              ),
            ),
          );
        }}
      >
        {popups.map((popup) => {
          const period = formatPopupPeriod(popup.startDate, popup.endDate);
          return (
            <Pressable
              key={popup.publicId}
              style={[styles.banner, { width, backgroundColor: themeColors.surface }]}
              accessibilityRole="button"
              accessibilityLabel={popup.name}
              onPress={() => onPressPopup(popup.publicId)}
            >
              <BannerBackground
                key={`${popup.coverImageUrl}:${popup.coverImageCacheKey}`}
                popup={popup}
              />
              <View
                style={[
                  styles.posterArea,
                  {
                    top: posterTop - spacing.space6,
                    left: insets.left + spacing.space16,
                    right: insets.right + spacing.space16,
                  },
                ]}
              >
                <BannerImage
                  key={`${popup.coverImageUrl}:${popup.coverImageCacheKey}`}
                  popup={popup}
                  width={posterWidth}
                  height={posterHeight}
                />
              </View>
              <BannerFooterGradient width={width} />
              <View
                style={[
                  styles.info,
                  {
                    left: insets.left + spacing.space16,
                    right: insets.right + spacing.space16,
                  },
                ]}
              >
                <Text
                  style={styles.title}
                  numberOfLines={2}
                  ellipsizeMode="tail"
                >
                  {popup.name}
                </Text>
                <Text
                  style={[styles.subtitle, styles.metaSpacing]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {period}
                </Text>
                <View style={styles.location}>
                  {popup.regionName ? (
                    <Ionicons name="location-sharp" size={16} color="#FFFFFF" />
                  ) : null}
                  <Text
                    style={[styles.subtitle, styles.locationText]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {getPopupRegionDisplayName(popup, resolvedLanguage)}
                  </Text>
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      <View pointerEvents="none" style={styles.pagination}>
        {popups.map((popup, index) => (
          <View
            key={popup.publicId}
            accessibilityState={{ selected: index === page }}
            style={[styles.dot, index === page && styles.activeDot]}
          />
        ))}
      </View>
    </View>
  );
}

export default function HomeBanner({ onPressPopup }: Props) {
  const { themeColors } = useTheme();
  const { status, popups } = useHomeMainBanners();
  const { width } = useWindowDimensions();
  if (status === "loading") return <View style={{ ...styles.banner, backgroundColor: themeColors.surface }} />;
  if (status === "error" || popups.length === 0) return null;
  return (
    <BannerPages
      key={`${width}:${popups.map((popup) => popup.publicId).join(",")}`}
      popups={popups}
      width={width}
      onPressPopup={onPressPopup}
    />
  );
}

const styles = StyleSheet.create({
  banner: {
    width: "100%",
    height: BANNER_HEIGHT,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  posterArea: {
    position: "absolute",
    bottom: spacing.space16,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  posterShadow: {
    borderRadius: radius.radius12,
    overflow: "visible",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.26,
    shadowRadius: 9,
    elevation: 6,
  },
  poster: { width: "100%", height: "100%", borderRadius: radius.radius12 },
  info: {
    position: "absolute",
    marginLeft: spacing.space16,
    bottom: spacing.space28,
    alignItems: "flex-start",
  },
  title: {
    ...typography.titleM,
    color: "#FFFFFF",
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  subtitle: {
    ...typography.label,
    fontWeight: "400",
    color: "#FFFFFF",
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  metaSpacing: { marginTop: spacing.space2 },
  location: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: spacing.space4,
    marginTop: 3,
  },
  locationText: { flexShrink: 1 },
  pagination: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: spacing.space12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    columnGap: spacing.space8,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: "rgba(255,255,255,0.45)",
  },
  activeDot: { width: 24, backgroundColor: "#FFFFFF" },
  background: { backgroundColor: "#252525" },
  backgroundImage: {
    position: "absolute",
    top: -spacing.space32,
    bottom: -spacing.space32,
    left: -spacing.space32,
    right: -spacing.space32,
  },
  backgroundShade: { backgroundColor: "rgba(0,0,0,0.28)" },
});
