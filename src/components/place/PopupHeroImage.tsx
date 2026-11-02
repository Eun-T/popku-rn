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

/** Match the mobile web poster's natural ratio inside a full-width blurred area. */
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
  const [posterSize, setPosterSize] = useState<{
    key: string; width: number; height: number;
  } | null>(null);
  const size = posterSize?.key === cover.imageKey ? posterSize : null;

  return (
    <View pointerEvents="box-none" style={[styles.layers, { paddingTop: topInset + spacing.space24 }]}>
      {hasPoster && (
        <Image
          key={`background:${cover.imageKey}`}
          source={cover.source}
          contentFit="cover"
          cachePolicy="memory-disk"
          blurRadius={35}
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
        style={[styles.poster, { aspectRatio: size ? size.width / size.height : 3 / 4 }]}
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
    width: "100%",
    paddingBottom: spacing.space24,
    alignItems: "center",
    overflow: "hidden",
    backgroundColor: "#111111",
  },
  background: {
    position: "absolute",
    top: -70,
    bottom: -70,
    left: -70,
    right: -70,
  },
  backgroundDim: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#000000",
    opacity: 0.2,
  },
  poster: {
    width: "74.1%",
    borderRadius: 5,
    overflow: "hidden",
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
