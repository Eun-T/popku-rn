import { useState } from "react";
import { StyleSheet, Text, View, type ImageSourcePropType } from "react-native";

import { useHomePopups } from "../../hooks/useHomePopups";
import { usePopupFavorites } from "../../hooks/usePopupFavorites";
import { colors, spacing, typography } from "../../theme/tokens";
import FilterChips from "../common/FilterChips";
import MoreButton from "../common/MoreButton";
import {
  HomeTrendingSkeleton,
  RankingSkeletonFooter,
} from "./HomePopupSkeleton";
import PopupRankingCard from "./PopupRankingCard";

const countries = [
  { label: "한국", value: "KR" },
  { label: "일본", value: "JP" },
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
  const [selectedCountry, setSelectedCountry] = useState<Country>("KR");
  const { status, popups } = useHomePopups("trending", selectedCountry);
  const [isExpanded, setIsExpanded] = useState(false);
  const { isFavorite, isFavoriteDisabled, toggleFavorite } = usePopupFavorites();

  const visiblePopups = popups.slice(0, isExpanded ? 10 : 5);

  const handleCountryChange = (country: Country) => {
    setSelectedCountry(country);
    setIsExpanded(false);
  };

  return (
    <View style={styles.section}>
      <Text style={styles.title}>
        지금 뜨는 팝업
      </Text>
      <Text style={styles.description}>요즘 인기 있는 팝업을 모아봤어요!</Text>
      <View style={styles.filters}>
        <FilterChips
          options={countries}
          value={selectedCountry}
          onChange={handleCountryChange}
        />
      </View>
      <View style={styles.rankingList}>
        {status === "loading" && <HomeTrendingSkeleton />}
        {status === "error" && (
          <Text style={styles.stateText}>팝업을 불러오지 못했어요.</Text>
        )}
        {status === "ready" && popups.length === 0 && (
          <Text style={styles.stateText}>지금 뜨는 팝업이 없어요.</Text>
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
                ...(popup.regionName ? [popup.regionName] : []),
                ...popup.tags.map((tag) => tag.name),
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
            label={isExpanded ? "접기" : "TOP 10 모두 보기"}
            onPress={() => setIsExpanded((current) => !current)}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
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
});
