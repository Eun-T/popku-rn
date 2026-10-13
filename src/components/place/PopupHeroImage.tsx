import { Image } from "expo-image";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  useHomeCoverImage,
  type RecoverHomeCover,
} from "../../hooks/useHomeCoverImage";
import { useTranslation } from "../../hooks/useTranslation";
import type { PublicPopup } from "../../lib/popups";

import { colors, radius, spacing, typography } from "../../theme/tokens";

type Props = {
  uri: string | null;
  accessibilityLabel: string;
  topInset: number;
  popup?: PublicPopup;
  coverScope?: string;
  onRecoverCover?: RecoverHomeCover;
};

const placeholderImage = require("../../../assets/images/ranking-placeholder.png");

/** The parent owns the stable viewport; intrinsic poster dimensions never resize it. */
export default function PopupHeroImage({
  uri,
  accessibilityLabel,
  topInset,
  popup,
  coverScope,
  onRecoverCover,
}: Props) {
  const { t } = useTranslation();
  const coverItem =
    popup && !popup.coverImageUrl
      ? { ...popup, coverImageCacheKey: null }
      : popup;
  const cover = useHomeCoverImage(
    uri ? { uri } : placeholderImage,
    coverItem,
    onRecoverCover,
    coverScope,
  );
  const hasPoster = typeof cover.source === "object";
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [posterSize, setPosterSize] = useState<{
    key: string; width: number; height: number;
  } | null>(null);
  const availableWidth = viewport.width - spacing.space16 * 2;
  const availableHeight = viewport.height - topInset - spacing.space16 * 2;
  const size = posterSize?.key === cover.imageKey ? posterSize : null;
  const fitScale = size && availableWidth > 0 && availableHeight > 0
    ? Math.min(availableWidth / size.width, availableHeight / size.height)
    : null;
  const fittedPoster = size && fitScale !== null ? {
    width: size.width * fitScale,
    height: size.height * fitScale,
    left: spacing.space16 + (availableWidth - size.width * fitScale) / 2,
    top: topInset + spacing.space16 + (availableHeight - size.height * fitScale) / 2,
    right: undefined,
    bottom: undefined,
  } : null;

  return (
    <View pointerEvents="box-none" style={styles.layers}
      onLayout={({ nativeEvent: { layout } }) => {
        setViewport(current => current.width === layout.width && current.height === layout.height
          ? current : { width: layout.width, height: layout.height });
      }}>
      {hasPoster && (
        <Image
          key={`background:${cover.imageKey}`}
          source={cover.source}
          contentFit="cover"
          cachePolicy="memory-disk"
          blurRadius={20}
          pointerEvents="none"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.background}
          onError={cover.onError}
          onLoad={cover.onLoad}
        />
      )}
      {hasPoster && (
        <View
          pointerEvents="none"
          style={styles.backgroundDim}
          accessible={false}
        />
      )}
      <Image
        key={cover.imageKey}
        source={cover.source}
        contentFit="contain"
        cachePolicy="memory-disk"
        pointerEvents="none"
        accessibilityLabel={accessibilityLabel}
        onError={cover.onError}
        onLoad={(event) => {
          cover.onLoad();
          if (event?.source.width > 0 && event.source.height > 0) {
            setPosterSize({ key: cover.imageKey, width: event.source.width, height: event.source.height });
          }
        }}
        style={[styles.poster, { top: topInset + spacing.space16 }, ...(fittedPoster ? [fittedPoster] : [])]}
      />
      {cover.canRetry && (
        <Pressable
          testID="detail-cover-retry"
          accessibilityRole="button"
          accessibilityLabel={t("home.card.retryImage", {
            title: accessibilityLabel,
          })}
          accessibilityState={{ disabled: cover.busy }}
          disabled={cover.busy}
          onPress={(event) => {
            event.stopPropagation();
            cover.retry();
          }}
          style={styles.retry}
        >
          <Text style={styles.retryText}>{t("home.card.retry")}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  layers: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    overflow: "hidden",
    backgroundColor: "#111111",
  },
  background: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    opacity: 0.55,
    transform: [{ scale: 1.12 }],
  },
  backgroundDim: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#000000",
    opacity: 0.15,
  },
  poster: {
    position: "absolute",
    borderRadius: radius.radius12,
    overflow: "hidden",
    top: spacing.space16,
    bottom: spacing.space16,
    left: spacing.space16,
    right: spacing.space16,
  },
  retry: {
    position: "absolute",
    left: spacing.space16 + spacing.space8,
    bottom: spacing.space16 + spacing.space8,
    paddingHorizontal: spacing.space8,
    paddingVertical: spacing.space6,
    borderRadius: radius.radius4,
    backgroundColor: colors.background,
  },
  retryText: { ...typography.caption, color: colors.text },
});
