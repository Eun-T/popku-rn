import { getPopupRegionDisplayName, getTagDisplayName } from '../../locales/filterLabels';
import { useMemo, useState } from "react";
import { useTheme } from '../../theme/useTheme';
import { Store } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View, type ImageSourcePropType } from "react-native";

import { useHomePopups } from "../../hooks/useHomePopups";
import { usePopupFavorites } from "../../hooks/usePopupFavorites";
import { useTranslation } from '../../hooks/useTranslation';
import { colors, radius, spacing, typography } from "../../theme/tokens";
import FilterChips from "../common/FilterChips";
import MoreButton from "../common/MoreButton";
import {
  HomeTrendingSkeleton,
  RankingSkeletonFooter,
} from "./HomePopupSkeleton";
import PopupRankingCard from "./PopupRankingCard";

const countries = [
  { labelKey: 'place.filters.countries.kr', value: "KR" },
  { labelKey: 'place.filters.countries.jp', value: "JP" },
] as const;
type Country = (typeof countries)[number]["value"];

const placeholderImage = require("../../../assets/images/ranking-placeholder.png");

function cardImage(url: string | null): ImageSourcePropType {
  return url ? { uri: url } : placeholderImage;
}

function displayDate(date: string): string {
  return date.replace(/-/g, ".");
}

export default function HomeTrendingSection({ onPressPopup }: { onPressPopup: (id: string) => void }) {
  const { t, resolvedLanguage } = useTranslation();
  const { themeColors } = useTheme();
  const styles = useMemo(() => ({ ...baseStyles,
    title: { ...baseStyles.title, color: themeColors.textPrimary },
    description: { ...baseStyles.description, color: themeColors.textSecondary },
    stateText: { ...baseStyles.stateText, color: themeColors.textSecondary },
    emptyCard: { ...baseStyles.emptyCard, backgroundColor: themeColors.surface },
    emptyTitle: { ...baseStyles.emptyTitle, color: themeColors.textPrimary },
    emptyDescription: { ...baseStyles.emptyDescription, color: themeColors.textSecondary },
  }), [themeColors]);
  const [selectedCountry, setSelectedCountry] = useState<Country>("KR");
  const { status, popups } = useHomePopups("trending", selectedCountry);
  const [isExpanded, setIsExpanded] = useState(false);
  const { isFavorite, isFavoriteDisabled, toggleFavorite, favoritesStatus, retryFavorites } = usePopupFavorites();

  const visiblePopups = popups.slice(0, isExpanded ? 10 : 5);

  const handleCountryChange = (country: Country) => {
    setSelectedCountry(country);
    setIsExpanded(false);
  };

  return (
    <View style={styles.section}>
      <Text style={styles.title}>
        {t('home.trending.title')}
      </Text>
      <Text style={styles.description}>{t('home.trending.description')}</Text>
      <View style={styles.filters}>
        <FilterChips
          themeColors={themeColors}
          options={countries.map(({ labelKey, value }) => ({ label: t(labelKey), value }))}
          value={selectedCountry}
          onChange={handleCountryChange}
        />
      </View>
      <View style={styles.rankingList}>
        {favoritesStatus === 'error' && <Pressable accessibilityRole="button" accessibilityLabel={t('home.favoriteRetry')}
          onPress={() => { void retryFavorites(); }}>
          <Text style={styles.stateText}>{t('home.favoriteLoadFailed')}</Text>
        </Pressable>}
        {status === "loading" && <HomeTrendingSkeleton />}
        {status === "error" && (
          <Text style={styles.stateText}>{t('home.loadFailed')}</Text>
        )}
        {status === "ready" && popups.length === 0 && (
          <View style={styles.emptyCard}>
            <Store size={20} color={themeColors.inactiveIcon} />
            <Text style={styles.emptyTitle}>{t('home.trending.emptyTitle')}</Text>
            <Text style={styles.emptyDescription}>{t('home.trending.emptyDescription')}</Text>
          </View>
        )}
        {visiblePopups.map((popup, index) => {
          const rank = index + 1;
          const id = `${selectedCountry}-${popup.publicId}`;

          return (
            <PopupRankingCard
              key={id}
              rank={rank}
              image={cardImage(popup.coverImageUrl)}
              title={popup.name}
              period={`${displayDate(popup.startDate)} ~ ${displayDate(popup.endDate)}`}
              tags={[
                ...(popup.regionName ? [getPopupRegionDisplayName(popup, resolvedLanguage)] : []),
                ...popup.tags.map((tag) => getTagDisplayName(tag, resolvedLanguage)),
              ]}
              isFavorite={isFavorite(popup.publicId)}
              isFavoriteDisabled={isFavoriteDisabled(popup.publicId)}
              onToggleFavorite={() => void toggleFavorite(popup)}
              onPress={() =>
                onPressPopup(popup.publicId)
              }
            />
          );
        })}
      </View>
      {status === "loading" && (
        <View style={styles.moreButtonContainer}>
          <RankingSkeletonFooter />
        </View>
      )}
      {status === "ready" && popups.length > 5 && (
        <View style={styles.moreButtonContainer}>
          <MoreButton
            themeColors={themeColors}
            label={t(isExpanded ? 'place.filters.collapse' : 'home.trending.showAll')}
            onPress={() => setIsExpanded((current) => !current)}
          />
        </View>
      )}
    </View>
  );
}

const baseStyles = StyleSheet.create({
  section: {
    marginTop: spacing.space32,
    paddingHorizontal: spacing.space16,
  },
  title: {
    ...typography.titleM,
    color: colors.text,
  },
  description: {
    marginTop: 2,
    ...typography.label,
    color: colors.secondaryText,
  },
  filters: {
    marginTop: spacing.space16,
  },
  rankingList: {
    marginTop: spacing.space16,
    // rowGap: spacing.space12,
  },
  moreButtonContainer: {
    marginTop: spacing.space12,
  },
  stateText: {
    ...typography.body,
    color: colors.secondaryText,
  },
  emptyCard: {
    minHeight: 110,
    padding: spacing.space16,
    borderRadius: radius.radius12,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    marginTop: spacing.space8,
    ...typography.label,
    color: colors.text,
    textAlign: "center",
  },
  emptyDescription: {
    marginTop: spacing.space2,
    ...typography.caption,
    color: colors.secondaryText,
    textAlign: "center",
  },
});
