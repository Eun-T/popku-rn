import { BlurTargetView, BlurView } from "expo-blur";
import { Image, type ImageSource } from "expo-image";
import { useFocusEffect } from "expo-router";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import type { PublicPopup } from "../../lib/popups";
import { t } from "../../locales";
import { useTranslation } from '../../hooks/useTranslation';
import { colors, radius, spacing, typography } from "../../theme/tokens";
import SkeletonBlock from "../common/SkeletonBlock";

type TodayOpeningCarouselProps = {
  items: readonly PublicPopup[];
  width: number;
  today: string;
  loading: boolean;
  error: boolean;
  onPressPopup: (popup: PublicPopup) => void;
};

const placeholderImage = require("../../../assets/images/ranking-placeholder.png");

const CARD_HEIGHT = 280;
const POSTER_HEIGHT = CARD_HEIGHT * 0.75;

function imageDiagnostics(publicId: string, layer: "background" | "poster") {
  if (!__DEV__) return {};
  const log = (event: string, detail?: unknown) =>
    console.log("[EndingSoon] image", { publicId, layer, event, detail });
  return {
    onLoadStart: () => log("loadStart"),
    onLoad: (event: { cacheType: string }) =>
      log("load", { cacheType: event.cacheType }),
    onDisplay: () => log("display"),
    onError: (event: { error: string }) => log("error", event.error),
    onLoadEnd: () => log("loadEnd"),
  };
}

function PosterBackground({
  source,
  publicId,
}: {
  source: ImageSource | number;
  publicId: string;
}) {
  const blurTarget = useRef<View>(null);
  useEffect(() => {
    if (__DEV__) console.log("[EndingSoon] background mount", { publicId });
    return () => {
      if (__DEV__) console.log("[EndingSoon] background unmount", { publicId });
    };
  }, [publicId]);

  return (
    <>
      <BlurTargetView
        ref={blurTarget}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      >
        <Image
          source={source}
          contentFit="cover"
          style={StyleSheet.absoluteFill}
          {...imageDiagnostics(publicId, "background")}
        />
      </BlurTargetView>
      <BlurView
        pointerEvents="none"
        blurTarget={blurTarget}
        blurMethod="dimezisBlurView"
        intensity={35}
        tint="dark"
        style={StyleSheet.absoluteFill}
      />
    </>
  );
}

function formatDate(value: string, includeYear: boolean): string {
  const [year, month, day] = value.split("-");
  return `${includeYear ? `${year.slice(-2)}.` : ""}${month}.${day}`;
}

export default function TodayOpeningCarousel({
  items,
  width,
  today,
  loading,
  error,
  onPressPopup,
}: TodayOpeningCarouselProps) {
  const { resolvedLanguage } = useTranslation();
  const listRef = useRef<FlatList<PublicPopup>>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const diagnosticItems = useRef(items);
  diagnosticItems.current = items;
  const previousFocusUrls = useRef(new Map<string, string | null>());
  useEffect(() => {
    if (__DEV__) console.log("[EndingSoon] carousel mount");
    return () => {
      if (__DEV__) console.log("[EndingSoon] carousel unmount");
    };
  }, []);
  useFocusEffect(
    useCallback(() => {
      if (!__DEV__) return;
      const currentItems = diagnosticItems.current;
      console.log(
        "[EndingSoon] focus",
        currentItems.map((item) => ({
          publicId: item.publicId,
          hasUrl: !!item.coverImageUrl,
          sameUrlAsPreviousFocus: previousFocusUrls.current.has(item.publicId)
            ? previousFocusUrls.current.get(item.publicId) ===
              item.coverImageUrl
            : null,
          hasServerCacheKey: !!item.coverImageCacheKey,
        })),
      );
      previousFocusUrls.current = new Map(
        currentItems.map((item) => [item.publicId, item.coverImageUrl]),
      );
      for (const item of currentItems) {
        if (!item.coverImageUrl) continue;
        void Image.getCachePathAsync(item.coverImageUrl)
          .then((path) => {
            console.log("[EndingSoon] URL disk cache", {
              publicId: item.publicId,
              hit: !!path,
            });
          })
          .catch(() =>
            console.log("[EndingSoon] URL disk cache unavailable", {
              publicId: item.publicId,
            }),
          );
      }
      return () => {
        previousFocusUrls.current = new Map(
          diagnosticItems.current.map((item) => [
            item.publicId,
            item.coverImageUrl,
          ]),
        );
        console.log("[EndingSoon] blur");
      };
    }, []),
  );
  useEffect(() => {
    if (__DEV__)
      console.log(
        "[EndingSoon] sources",
        items.map((item) => ({
          publicId: item.publicId,
          hasUrl: !!item.coverImageUrl,
        })),
      );
  }, [items]);

  const currentIndex = Math.min(activeIndex, items.length - 1);
  const posterWidth = Math.max(0, Math.min(POSTER_HEIGHT, width - 96));
  const goToIndex = (index: number) => {
    listRef.current?.scrollToOffset({ offset: index * width, animated: true });
    setActiveIndex(index);
  };

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{t("place.explore.endingSoonTitle")}</Text>
      <Text style={styles.description}>{t("place.explore.endingSoonDescription")}</Text>
      {items.length === 0 || width <= 0 ? (
        loading ? (
          <View
            style={[
              styles.carousel,
              { width, backgroundColor: colors.surface },
            ]}
          >
            <SkeletonBlock
              width="100%"
              height={CARD_HEIGHT}
              borderRadius={radius.radius16}
            />
          </View>
        ) : (
          <Text style={styles.emptyText}>
            {error
              ? t("home.loadFailed")
              : t("place.explore.endingSoonEmpty")}
          </Text>
        )
      ) : (
        <View
          style={[styles.carousel, { width, backgroundColor: colors.surface }]}
        >
          <FlatList
            ref={listRef}
            data={items}
            extraData={resolvedLanguage}
            keyExtractor={(item) => item.publicId}
            horizontal
            snapToInterval={width}
            snapToAlignment="start"
            disableIntervalMomentum
            decelerationRate="fast"
            bounces={false}
            overScrollMode="never"
            scrollEnabled={items.length > 1}
            showsHorizontalScrollIndicator={false}
            getItemLayout={(_, index) => ({
              length: width,
              offset: width * index,
              index,
            })}
            onMomentumScrollEnd={(event) => {
              const nextIndex = Math.round(
                event.nativeEvent.contentOffset.x / width,
              );
              setActiveIndex(
                Math.max(0, Math.min(items.length - 1, nextIndex)),
              );
            }}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                onPress={() => onPressPopup(item)}
                style={[
                  styles.card,
                  { width, backgroundColor: colors.surface },
                ]}
              >
                <PosterBackground
                  publicId={item.publicId}
                  source={
                    item.coverImageUrl
                      ? { uri: item.coverImageUrl }
                      : placeholderImage
                  }
                />
                <Image
                  source={
                    item.coverImageUrl
                      ? { uri: item.coverImageUrl }
                      : placeholderImage
                  }
                  contentFit="contain"
                  style={[styles.poster, { width: posterWidth }]}
                  {...imageDiagnostics(item.publicId, "poster")}
                />
                <View pointerEvents="none" style={styles.bottomGradient}>
                  <Svg width="100%" height="100%">
                    <Defs>
                      <LinearGradient
                        id="textShade"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <Stop offset="0" stopColor="#000000" stopOpacity="0" />
                        <Stop
                          offset="1"
                          stopColor="#000000"
                          stopOpacity="0.82"
                        />
                      </LinearGradient>
                    </Defs>
                    <Rect width="100%" height="100%" fill="url(#textShade)" />
                  </Svg>
                </View>
                <View pointerEvents="none" style={styles.caption}>
                  <Text style={styles.deadlineBadge}>
                    {Date.parse(`${item.endDate}T00:00:00Z`) ===
                    Date.parse(`${today}T00:00:00Z`)
                      ? t("place.explore.endsToday")
                      : `D-${Math.round((Date.parse(`${item.endDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000)}`}
                  </Text>
                  <Text
                    numberOfLines={2}
                    ellipsizeMode="tail"
                    style={styles.title}
                  >
                    {item.name}
                  </Text>
                  <Text
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    style={styles.period}
                  >
                    {formatDate(item.startDate, true)} ~{" "}
                    {formatDate(
                      item.endDate,
                      item.startDate.slice(0, 4) !== item.endDate.slice(0, 4),
                    )}
                  </Text>
                </View>
              </Pressable>
            )}
          />
          {currentIndex > 0 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("place.explore.previous")}
              onPress={() => goToIndex(currentIndex - 1)}
              style={[styles.arrow, styles.previousArrow]}
            >
              <ChevronLeft size={24} color={colors.text} />
            </Pressable>
          )}
          {currentIndex < items.length - 1 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("place.explore.next")}
              onPress={() => goToIndex(currentIndex + 1)}
              style={[styles.arrow, styles.nextArrow]}
            >
              <ChevronRight size={24} color={colors.text} />
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: spacing.space20,
  },
  heading: {
    ...typography.titleM,
    color: colors.text,
    marginBottom: spacing.space2,
  },
  description: {
    ...typography.label,
    color: colors.secondaryText,
    marginBottom: spacing.space16,
  },
  emptyText: { ...typography.label, color: colors.secondaryText },
  carousel: {
    height: CARD_HEIGHT,
    borderRadius: radius.radius16,
    overflow: "hidden",
  },
  card: {
    height: CARD_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  poster: {
    height: POSTER_HEIGHT,
  },
  bottomGradient: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 148,
  },
  caption: {
    position: "absolute",
    left: spacing.space16,
    right: spacing.space16,
    bottom: spacing.space16,
    rowGap: spacing.space4,
  },
  title: {
    ...typography.titleS,
    fontWeight: "700",
    color: colors.background,
  },
  deadlineBadge: {
    ...typography.caption,
    fontWeight: "600",
    color: colors.background,
    backgroundColor: "#ff2f47",
    alignSelf: "flex-start",
    minHeight: 24,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.radius12,
    marginBottom: spacing.space4,
  },
  period: {
    ...typography.caption,
    fontSize: 14,
    lineHeight: 20,
    color: "#F3F4F6",
  },
  arrow: {
    position: "absolute",
    top: (CARD_HEIGHT - 40) / 2,
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  previousArrow: {
    left: spacing.space4,
  },
  nextArrow: {
    right: spacing.space4,
  },
});
