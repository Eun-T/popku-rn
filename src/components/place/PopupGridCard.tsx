import { getPopupRegionDisplayName, getTagDisplayName } from '../../locales/filterLabels';
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from '../../hooks/useTranslation';
import { Image } from "expo-image";
import { Heart } from "lucide-react-native";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

import type { PublicPopup } from "../../lib/popups";
import { usePlaceCoverImage, type RecoverPlaceCover } from "../../hooks/usePlaceCoverImage";
import { colors, radius, spacing, typography } from "../../theme/tokens";

type PopupGridCardProps = {
  item: PublicPopup;
  width: number;
  isFavorite: boolean;
  isFavoriteDisabled: boolean;
  onToggleFavorite: () => void;
  onPress?: (item: PublicPopup) => void;
  onRecoverCover?: RecoverPlaceCover;
  today?: string;
};

const placeholderImage = require("../../../assets/images/ranking-placeholder.png");
const favoriteIconSize = 26;

function formatPeriod(startDate: string, endDate: string | null, pendingLabel: string): string {
  const [startYear, startMonth, startDay] = startDate.split("-");
  const start = `${startYear.slice(-2)}.${startMonth}.${startDay}`;
  if (!endDate) return `${start} ~ ${pendingLabel}`;
  const [endYear, endMonth, endDay] = endDate.split("-");
  const end = `${endYear.slice(-2)}.${endMonth}.${endDay}`;
  return `${start} ~ ${end}`;
}

// Keep the web list's calendar-day precedence and partial-date behavior local.
function cardDayStatus(item: PublicPopup, today: string, language: string) {
  const { startDate: start, endDate: end } = item;
  const ja = language === "ja";
  const daysUntil = (date: string) =>
    (Date.parse(date + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86_400_000;
  if (end && end < today) return { label: ja ? "終了" : "종료", color: "#9CA3AF" };
  if (start && start > today) return { label: (ja ? "オープン" : "오픈") + " D-" + daysUntil(start), color: "#2563EB" };
  if (end === today) return { label: ja ? "本日終了" : "오늘 종료", color: "#C05621" };
  if (start === today) return { label: ja ? "本日オープン" : "오늘 오픈", color: "#16805D" };
  if (start && start < today && end && end > today) return { label: (ja ? "終了" : "종료") + " D-" + daysUntil(end), color: "#16805D" };
  return null;
}

function currentCardDay() {
  // KR and JP both use UTC+09:00.
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export default function PopupGridCard({
  item,
  width,
  isFavorite,
  isFavoriteDisabled,
  onToggleFavorite,
  onPress,
  onRecoverCover,
  today = currentCardDay(),
}: PopupGridCardProps) {
  const { t, resolvedLanguage } = useTranslation();
  const dayStatus = cardDayStatus(item, today, resolvedLanguage);
  const { fontScale } = useWindowDimensions();
  const cover = usePlaceCoverImage(item, onRecoverCover);
  const region = getPopupRegionDisplayName(item, resolvedLanguage).trim();
  // Legacy multi-category rows need an explicit admin decision; never pick the first tag.
  const category = item.tags.length === 1 ? item.tags[0] : undefined;

  return (
    <Pressable
      onPress={onPress ? () => onPress(item) : undefined}
      accessibilityRole={onPress ? "button" : undefined}
      style={[styles.card, { width }]}
    >
      <View style={styles.posterArea}>
        <Image
          source={cover.source ?? placeholderImage}
          contentFit="cover"
          cachePolicy="memory-disk"
          onError={cover.onError}
          onLoad={cover.onLoad}
          style={styles.poster}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            isFavorite
              ? t("place.all.removeFavorite")
              : t("place.all.addFavorite")
          }
          accessibilityState={{
            selected: isFavorite,
            disabled: isFavoriteDisabled,
          }}
          disabled={isFavoriteDisabled}
          onPress={(event) => {
            event.stopPropagation();
            onToggleFavorite();
          }}
          style={styles.favoriteButton}
        >
          <View
            pointerEvents="none"
            accessible={false}
            style={styles.favoriteIcon}
          >
            <Heart
              size={favoriteIconSize}
              color={isFavorite ? "#FF5A6E" : colors.text}
              strokeWidth={2}
              fill="none"
              style={styles.favoriteIconLayer}
            />
            <Heart
              size={favoriteIconSize}
              color={isFavorite ? "#FF5A6E" : colors.background}
              strokeWidth={2}
              fill={isFavorite ? "#FF5A6E" : colors.secondaryText}
              style={styles.favoriteIconLayer}
            />
          </View>
        </Pressable>
      </View>

      {dayStatus && (
        <Text style={[styles.dayStatus, { color: dayStatus.color }]}>
          {dayStatus.label}
        </Text>
      )}

      <Text numberOfLines={1} ellipsizeMode="tail" style={styles.title}>
        {item.name}
      </Text>

      <Text numberOfLines={1} ellipsizeMode="tail" style={styles.period}>
        {formatPeriod(item.startDate, item.endDate, t('place.detail.schedulePending'))}
      </Text>

      <View
        style={[
          styles.metadata,
          { minHeight: typography.caption.lineHeight * fontScale },
        ]}
      >
        {!!region && (
          <View style={styles.location}>
            <Ionicons name="location-sharp" size={16} color={colors.secondaryText} />
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={[styles.metadataText, styles.regionText]}
            >
              {region}
            </Text>
          </View>
        )}
        {!!category?.name.trim() && (
          <View style={styles.tag}>
            <Text numberOfLines={1} style={[styles.metadataText, styles.categoryText]}>
              {getTagDisplayName(category, resolvedLanguage).trim()}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background,
  },
  posterArea: {
    width: "100%",
    aspectRatio: 3 / 4,
  },
  poster: {
    width: "100%",
    height: "100%",
    borderRadius: 6,
  },
  favoriteButton: {
    position: "absolute",
    right: spacing.space8,
    bottom: spacing.space8,
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.25,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  favoriteIcon: {
    width: favoriteIconSize,
    height: favoriteIconSize,
  },
  favoriteIconLayer: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  dayStatus: {
    marginTop: spacing.space12,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 20,
  },
  title: {
    marginTop: spacing.space4,
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 24,
    color: colors.text,
  },
  metadata: {
    marginTop: spacing.space4,
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    columnGap: spacing.space6,
    overflow: "hidden",
  },
  location: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: spacing.space4,
    minWidth: 0,
    flexShrink: 1,
  },
  regionText: {
    minWidth: 0,
    flexShrink: 1,
  },
  tag: {
    flexShrink: 0,
    paddingHorizontal: spacing.space4,
    borderRadius: radius.radius4,
    backgroundColor: "#F3F4F6",
  },
  categoryText: {
    color: "#4B5563",
  },
  metadataText: {
    ...typography.caption,
    color: colors.secondaryText,
  },
  period: {
    marginTop: 3,
    minWidth: 0,
    flexShrink: 1,
    ...typography.caption,
    fontWeight: "400",
    fontSize: 13,
    lineHeight: 20,
    color: colors.secondaryText,
  },
});
