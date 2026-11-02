import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  useHomeCoverImage,
  type RecoverHomeCover,
} from "../../hooks/useHomeCoverImage";
import { useTranslation } from "../../hooks/useTranslation";
import type { PublicPopup } from "../../lib/popups";
import { radius, spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/useTheme";

const placeholder = require("../../../assets/images/ranking-placeholder.png");
type Props = {
  popup: PublicPopup;
  width: number;
  period: string;
  coverScope: string;
  onRecoverCover?: RecoverHomeCover;
  onPress: () => void;
};

export default function JapanNewPopupCard({
  popup,
  width,
  period,
  coverScope,
  onRecoverCover,
  onPress,
}: Props) {
  const { t } = useTranslation();
  const { themeColors } = useTheme();
  const cover = useHomeCoverImage(
    popup.coverImageUrl ? { uri: popup.coverImageUrl } : placeholder,
    popup,
    onRecoverCover,
    coverScope,
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("place.explore.viewDetails", { title: popup.name })}
      onPress={onPress}
      style={{ width }}
    >
      <View>
        <Image
          key={cover.imageKey}
          source={cover.source}
          style={[
            styles.image,
            {
              width,
              height: (width * 4) / 3,
              backgroundColor: themeColors.surface,
            },
          ]}
          contentFit="cover"
          cachePolicy="memory-disk"
          onError={cover.onError}
          onLoad={cover.onLoad}
        />
        {cover.canRetry && (
          <Pressable
            testID="home-cover-retry"
            accessibilityRole="button"
            accessibilityLabel={t("home.card.retryImage", {
              title: popup.name,
            })}
            accessibilityState={{ disabled: cover.busy }}
            disabled={cover.busy}
            onPress={(event) => {
              event.stopPropagation();
              cover.retry();
            }}
            style={[styles.retry, { backgroundColor: themeColors.background }]}
          >
            <Text
              style={[typography.caption, { color: themeColors.textPrimary }]}
            >
              {t("home.card.retry")}
            </Text>
          </Pressable>
        )}
      </View>
      <Text
        style={[styles.title, { color: themeColors.textPrimary }]}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {popup.name}
      </Text>
      <Text
        style={[styles.period, { color: themeColors.textSecondary }]}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {period}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  image: { borderRadius: 5 },
  title: {
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 24,
    marginTop: spacing.space12,
  },
  period: { fontSize: 13, lineHeight: 20, marginTop: spacing.space2 },
  retry: {
    position: "absolute",
    top: spacing.space8,
    left: spacing.space8,
    paddingHorizontal: spacing.space8,
    paddingVertical: spacing.space6,
    borderRadius: radius.radius4,
  },
});
