import { useTranslation } from '../../hooks/useTranslation';
import { t } from '../../locales';
import { getPopupRegionDisplayName, getTagDisplayName } from '../../locales/filterLabels';
import { Ionicons } from "@expo/vector-icons";
import { Heart } from "lucide-react-native";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import type { PublicPopup } from "../../lib/popups";
import { colors, radius, spacing } from "../../theme/tokens";

type PlaceWeeklyPopupListProps = {
  popups: readonly PublicPopup[];
  onPressPopup: (popup: PublicPopup) => void;
  isFavorite: (publicId: string) => boolean;
  isFavoriteDisabled: (publicId: string) => boolean;
  onToggleFavorite: (popup: PublicPopup) => void;
};

const placeholderImage = require("../../../assets/images/ranking-placeholder.png");

function formatDate(value: string): string {
  const [, month, day] = value.split("-");
  return `${month}.${day}`;
}

function localDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function PlaceWeeklyPopupList({
  popups,
  onPressPopup,
  isFavorite,
  isFavoriteDisabled,
  onToggleFavorite,
}: PlaceWeeklyPopupListProps) {
  useTranslation();
  const todayString = localDateString(new Date());

  return (
    <View style={styles.list}>
      {popups.map((popup) => {
        const favorited = isFavorite(popup.publicId);

        const status =
          popup.startDate > todayString
            ? "오픈예정"
            : popup.endDate < todayString
              ? "종료됨"
              : "진행중";

        return (
          <Pressable
            key={popup.publicId}
            accessibilityRole="button"
            accessibilityLabel={popup.name}
            onPress={() => onPressPopup(popup)}
            style={styles.card}
          >
            <Image
              source={
                popup.coverImageUrl
                  ? { uri: popup.coverImageUrl }
                  : placeholderImage
              }
              resizeMode="cover"
              style={styles.poster}
            />

            <View style={styles.information}>
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                style={styles.title}
              >
                {popup.name}
              </Text>

              <View style={styles.statusRow}>
                <View
                  style={[
                    styles.chip,
                    status === "오픈예정"
                      ? styles.upcomingChip
                      : status === "종료됨"
                        ? styles.endedChip
                        : undefined,
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      status === "오픈예정"
                        ? styles.upcomingChipText
                        : status === "종료됨"
                          ? styles.endedChipText
                          : undefined,
                    ]}
                  >
                    {t(status === "오픈예정" ? "place.all.card.upcoming" : status === "종료됨" ? "place.all.card.ended" : "place.all.card.ongoing")}
                  </Text>
                </View>

                <Text numberOfLines={1} style={styles.period}>
                  {formatDate(popup.startDate)} - {formatDate(popup.endDate)}
                </Text>
              </View>

              <View style={styles.tagRow}>
                <View style={styles.location}>
                  <Ionicons
                    name="location-sharp"
                    size={16}
                    color={colors.secondaryText}
                  />

                  <Text
                    numberOfLines={1}
                    style={[styles.tagText, styles.regionText]}
                  >
                    {getPopupRegionDisplayName(popup)}
                  </Text>
                </View>

                {popup.tags[0] && (
                  <View style={styles.tag}>
                    <Text numberOfLines={1} style={styles.tagText}>
                      {popup.tags.map((tag) => getTagDisplayName(tag)).join(", ")}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t(favorited ? "place.all.removeFavorite" : "place.all.addFavorite")}
              accessibilityState={{
                selected: favorited,
                disabled: isFavoriteDisabled(popup.publicId),
              }}
              disabled={isFavoriteDisabled(popup.publicId)}
              onPress={(event) => {
                event.stopPropagation();
                onToggleFavorite(popup);
              }}
              style={styles.favoriteButton}
              hitSlop={spacing.space8}
            >
              <Heart
                size={22}
                color={favorited ? "#FF5A6E" : colors.secondaryText}
                fill={favorited ? "#FF5A6E" : "none"}
              />
            </Pressable>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    marginTop: spacing.space20,
    gap: 16,
  },

  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background,
  },

  poster: {
    width: 90,
    height: 90,
    borderRadius: radius.radius8,
  },

  information: {
    flex: 1,
    alignSelf: "center",
    marginLeft: spacing.space12,
    minWidth: 0,
  },

  title: {
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
    color: colors.text,
  },

  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: spacing.space6,
    marginTop: 4,
  },

  chip: {
    height: 22,
    justifyContent: "center",
    paddingHorizontal: spacing.space6,
    borderRadius: radius.radius4,
    backgroundColor: colors.primaryLight,
  },

  chipText: {
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 16,
    color: colors.primaryDark,
  },

  upcomingChip: {
    backgroundColor: colors.infoLight,
  },

  upcomingChipText: {
    color: colors.infoDark,
  },

  endedChip: {
    backgroundColor: colors.surface,
  },

  endedChipText: {
    color: colors.secondaryText,
  },

  period: {
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 18,
    color: colors.secondaryText,
  },

  tagRow: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 5,
    marginTop: 4,
  },

  tag: {
    height: 22,
    flexShrink: 1,
    justifyContent: "center",
    paddingHorizontal: 7,
    borderRadius: 5,
    backgroundColor: colors.surface,
  },

  location: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: spacing.space2,
    minWidth: 0,
    flexShrink: 1,
  },

  regionText: {
    minWidth: 0,
    flexShrink: 1,
  },

  tagText: {
    fontSize: 11,
    fontWeight: "500",
    lineHeight: 16,
    color: colors.secondaryText,
  },

  favoriteButton: {
    width: 44,
    height: 44,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
  },
});
