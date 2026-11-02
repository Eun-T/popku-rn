import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image, type ImageSource } from "expo-image";
import { useHomeCoverImage, type RecoverHomeCover } from "../../hooks/useHomeCoverImage";
import type { PublicPopup } from "../../lib/popups";
import { spacing, typography } from "../../theme/tokens";
import { useTranslation } from "../../hooks/useTranslation";
import { useTheme } from "../../theme/useTheme";

type PopupRankingCardProps = {
  width: number;
  rank: number;
  image: ImageSource | number;
  popup?: PublicPopup;
  coverScope?: string;
  onRecoverCover?: RecoverHomeCover;
  title: string;
  period: string;
  isFavorite: boolean;
  isFavoriteDisabled: boolean;
  onToggleFavorite: () => void;
  onPress: () => void;
};

export default function PopupRankingCard({
  width, rank, image, popup, coverScope, onRecoverCover, title, period,
  onPress,
}: PopupRankingCardProps) {
  const { t } = useTranslation();
  const { themeColors } = useTheme();
  const cover = useHomeCoverImage(image, popup, onRecoverCover, coverScope);
  return (
    <View style={{ width }}>
      <Pressable accessibilityRole="button" accessibilityLabel={t("place.explore.viewDetails", { title })} onPress={onPress}>
        <View style={[styles.imageFrame, { backgroundColor: themeColors.surface }]}>
          <Image key={cover.imageKey} source={cover.source} style={StyleSheet.absoluteFill}
            contentFit="cover" contentPosition="center" cachePolicy="memory-disk"
            onError={cover.onError} onLoad={cover.onLoad} />
          <Text pointerEvents="none" style={styles.rankText}>{rank}</Text>
          {cover.canRetry && (
            <Pressable testID="home-cover-retry" accessibilityRole="button"
              accessibilityLabel={t("home.card.retryImage", { title })}
              accessibilityState={{ disabled: cover.busy }} disabled={cover.busy}
              onPress={event => { event.stopPropagation(); cover.retry(); }}
              style={[styles.imageRetry, { backgroundColor: themeColors.background }]}>
              <Text style={[typography.caption, { color: themeColors.textPrimary }]}>{t("home.card.retry")}</Text>
            </Pressable>
          )}
        </View>
        <Text style={[styles.title, { color: themeColors.textPrimary }]} numberOfLines={1} ellipsizeMode="tail">{title}</Text>
        <Text style={[styles.period, { color: themeColors.textSecondary }]} numberOfLines={1} ellipsizeMode="tail">{period}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  imageFrame: { width: "100%", aspectRatio: 3 / 4, borderRadius: 5, overflow: "hidden" },
  rankText: {
    position: "absolute", top: spacing.space12, left: spacing.space12,
    color: "#FFFFFF", fontSize: 32, fontWeight: "800", lineHeight: 32,
    textShadowColor: "rgba(0,0,0,0.8)", textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 12,
  },
  title: { marginTop: spacing.space12, fontSize: 16, fontWeight: "600", lineHeight: 24 },
  period: { marginTop: spacing.space2, fontSize: 13, fontWeight: "400", lineHeight: 20 },
  imageRetry: {
    position: "absolute", left: spacing.space8, bottom: spacing.space8,
    paddingHorizontal: spacing.space8, paddingVertical: spacing.space6, borderRadius: 4,
  },
});
