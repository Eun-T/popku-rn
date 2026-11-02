import type { ImageSource } from "expo-image";
import { Store } from "lucide-react-native";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useHomePopups } from "../../hooks/useHomePopups";
import { usePopupFavorites } from "../../hooks/usePopupFavorites";
import { useTranslation } from "../../hooks/useTranslation";
import { spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/useTheme";
import SkeletonBlock from "../common/SkeletonBlock";
import PopupRankingCard from "./PopupRankingCard";

// Preserve the existing default request and cache scope without country controls.
const selectedCountry = "KR";
const placeholderImage = require("../../../assets/images/ranking-placeholder.png");

function cardImage(url: string | null): ImageSource | number {
  return url ? { uri: url } : placeholderImage;
}
function displayDate(date: string): string {
  return `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`;
}
type Props = {
  onPressPopup: (id: string) => void;
};

export default function HomeTrendingSection({ onPressPopup }: Props) {
  const { t, resolvedLanguage } = useTranslation();
  const { themeColors } = useTheme();
  const { width } = useWindowDimensions();
  const cardWidth = (width - spacing.space16 * 2 - spacing.space12) / 2;
  const { status, popups, recoverCover } = useHomePopups(
    "trending",
    selectedCountry,
  );
  const {
    isFavorite,
    isFavoriteDisabled,
    toggleFavorite,
    favoritesStatus,
    retryFavorites,
  } = usePopupFavorites();
  const visiblePopups = popups.slice(0, 10);

  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <Text style={[styles.title, { color: themeColors.textPrimary }]}>
          {t("home.trending.title")}
        </Text>
        <Text style={styles.badge}>TOP 10</Text>
      </View>
      <View style={styles.rankingList}>
        {favoritesStatus === "error" && (
          <Pressable
            style={styles.stateContainer}
            accessibilityRole="button"
            accessibilityLabel={t("home.favoriteRetry")}
            onPress={() => {
              void retryFavorites();
            }}
          >
            <Text
              style={[styles.stateText, { color: themeColors.textSecondary }]}
            >
              {t("home.favoriteLoadFailed")}
            </Text>
          </Pressable>
        )}
        {status === "error" && (
          <Text
            style={[
              styles.stateContainer,
              styles.stateText,
              { color: themeColors.textSecondary },
            ]}
          >
            {t("home.loadFailed")}
          </Text>
        )}
        {status === "ready" && popups.length === 0 && (
          <View
            style={[
              styles.stateContainer,
              styles.emptyCard,
              { backgroundColor: themeColors.surface },
            ]}
          >
            <Store size={20} color={themeColors.inactiveIcon} />
            <Text
              style={[styles.emptyTitle, { color: themeColors.textPrimary }]}
            >
              {t("home.trending.emptyTitle")}
            </Text>
            <Text
              style={[
                styles.emptyDescription,
                { color: themeColors.textSecondary },
              ]}
            >
              {t("home.trending.emptyDescription")}
            </Text>
          </View>
        )}
        <ScrollView
          horizontal
          nestedScrollEnabled
          directionalLockEnabled
          showsHorizontalScrollIndicator={false}
          snapToInterval={cardWidth + spacing.space12}
          snapToAlignment="start"
          decelerationRate="fast"
          style={styles.viewport}
          contentContainerStyle={styles.track}
        >
          {status === "loading" &&
            Array.from({ length: 2 }, (_, index) => (
              <View
                key={`loading-${index}`}
                style={{ width: cardWidth }}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <SkeletonBlock
                  backgroundColor={themeColors.skeletonBackground}
                  width={cardWidth}
                  height={(cardWidth * 4) / 3}
                  borderRadius={5}
                />
                <SkeletonBlock
                  backgroundColor={themeColors.skeletonBackground}
                  width="90%"
                  height={24}
                  style={styles.skeletonTitle}
                />
                <SkeletonBlock
                  backgroundColor={themeColors.skeletonBackground}
                  width="80%"
                  height={20}
                  style={styles.skeletonPeriod}
                />
              </View>
            ))}
          {visiblePopups.map((popup, index) => (
            <PopupRankingCard
              key={`${selectedCountry}-${popup.publicId}`}
              width={cardWidth}
              rank={index + 1}
              image={cardImage(popup.coverImageUrl)}
              popup={popup}
              coverScope={`${selectedCountry}:${resolvedLanguage}`}
              onRecoverCover={recoverCover}
              title={popup.name}
              period={`${displayDate(popup.startDate)} - ${popup.endDate ? displayDate(popup.endDate) : t("place.detail.schedulePending")}`}
              isFavorite={isFavorite(popup.publicId)}
              isFavoriteDisabled={isFavoriteDisabled(popup.publicId)}
              onToggleFavorite={() => void toggleFavorite(popup)}
              onPress={() => onPressPopup(popup.publicId)}
            />
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.space48 },
  heading: {
    paddingHorizontal: spacing.space16,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.space8,
    flexWrap: "wrap",
  },
  title: { ...typography.titleM },
  badge: {
    paddingVertical: spacing.space2,
    paddingHorizontal: spacing.space6,
    borderRadius: 6,
    backgroundColor: "#f0e7ff",
    color: "#7839ef",
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 20,
  },
  rankingList: { marginTop: spacing.space16 },
  viewport: { width: "100%", flexGrow: 0 },
  track: { paddingHorizontal: spacing.space16, columnGap: spacing.space12 },
  stateContainer: { marginHorizontal: spacing.space16 },
  stateText: { fontSize: 14, lineHeight: 20 },
  emptyCard: {
    minHeight: 110,
    padding: spacing.space16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    marginTop: spacing.space8,
    ...typography.label,
    textAlign: "center",
  },
  emptyDescription: {
    marginTop: spacing.space2,
    ...typography.caption,
    textAlign: "center",
  },
  skeletonTitle: { marginTop: spacing.space12 },
  skeletonPeriod: { marginTop: spacing.space2 },
});
