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
import { popupOperatingStatus } from "../../lib/popupStatus";
import { colors, radius, spacing, typography } from "../../theme/tokens";

type PopupGridCardProps = {
  item: PublicPopup;
  width: number;
  isFavorite: boolean;
  isFavoriteDisabled: boolean;
  onToggleFavorite: () => void;
  onPress?: (item: PublicPopup) => void;
  onRecoverCover?: RecoverPlaceCover;
};

const placeholderImage = require("../../../assets/images/ranking-placeholder.png");
const favoriteIconSize = 26;

function formatPeriod(startDate: string, endDate: string): string {
  const [startYear, startMonth, startDay] = startDate.split("-");
  const [endYear, endMonth, endDay] = endDate.split("-");
  const start = `${startYear.slice(-2)}.${startMonth}.${startDay}`;
  const end = `${endYear.slice(-2)}.${endMonth}.${endDay}`;
  return `${start} ~ ${end}`;
}

export default function PopupGridCard({
  item,
  width,
  isFavorite,
  isFavoriteDisabled,
  onToggleFavorite,
  onPress,
  onRecoverCover,
}: PopupGridCardProps) {
  const { t, resolvedLanguage } = useTranslation();
  const status = popupOperatingStatus(item.startDate, item.endDate);
  const statusText =
    t(status === "오픈 예정" ? "place.all.card.upcoming" : status === "종료" ? "place.all.card.ended" : "place.all.card.ongoing");
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
          source={
            cover.source ?? (item.coverImageUrl ? null : placeholderImage)
          }
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

      <View
        style={styles.statusRow}
      >
        <View
          style={[
            styles.statusBadge,
            status === "오픈 예정"
              ? styles.upcomingBadge
              : status === "종료"
                ? styles.endedBadge
                : styles.openBadge,
          ]}
        >
          <Text
            numberOfLines={1}
            style={[
              styles.statusText,
              status === "오픈 예정"
                ? styles.upcomingText
                : status === "종료"
                  ? styles.endedText
                  : styles.openText,
            ]}
          >
            {statusText}
          </Text>
        </View>
      </View>

      <Text numberOfLines={1} ellipsizeMode="tail" style={styles.title}>
        {item.name}
      </Text>

      <Text numberOfLines={1} ellipsizeMode="tail" style={styles.period}>
        {formatPeriod(item.startDate, item.endDate)}
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
    aspectRatio: 4 / 5,
  },
  poster: {
    width: "100%",
    height: "100%",
    borderRadius: radius.radius8,
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
  statusRow: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    marginTop: spacing.space8,
  },
  statusBadge: {
    flexShrink: 0,
    alignItems: "center",
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  statusText: {
    ...typography.caption,
    fontWeight: "600",
    flexShrink: 0,
    fontSize: 12,
    lineHeight: 16,
  },
  upcomingText: {
    color: "#1D4ED8",
  },
  openText: {
    color: "#15803D",
  },
  endedText: {
    color: "#6B7280",
  },
  upcomingBadge: {
    backgroundColor: "#DBEAFE",
  },
  openBadge: {
    backgroundColor: "#DCFCE7",
  },
  endedBadge: {
    backgroundColor: "#F3F4F6",
  },
  title: {
    marginTop: spacing.space4,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 20,
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
