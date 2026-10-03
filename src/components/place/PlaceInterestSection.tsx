import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from "react-native";

import { interestFilters, type InterestId } from "../../constants/placeFilters";
import { t } from "../../locales";
import { colors, radius, spacing, typography } from "../../theme/tokens";

type InterestCard = {
  id: InterestId;
  image: ImageSourcePropType;
};

type PlaceInterestSectionProps = {
  onPressCategory?: (id: InterestId) => void;
};

const interestCards: readonly InterestCard[] = [
  {
    id: "animeCharacter",
    image: require("../../../assets/images/categories/anime-character.webp"),
  },
  {
    id: "beauty",
    image: require("../../../assets/images/categories/beauty.webp"),
  },
  {
    id: "game",
    image: require("../../../assets/images/categories/game-digital.webp"),
  },
  {
    id: "fashion",
    image: require("../../../assets/images/categories/fashion.webp"),
  },
];

export default function PlaceInterestSection({
  onPressCategory,
}: PlaceInterestSectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{t("place.explore.interests")}</Text>
      <Text numberOfLines={1} ellipsizeMode="tail" style={styles.description}>
        {t("place.explore.interestsDescription")}
      </Text>
      <View style={styles.cards}>
        {interestCards.map((card) => {
          const filter = interestFilters.find(
            (interest) => interest.id === card.id,
          );
          const label =
            card.id === "game" ? "게임·디지털" : t(filter?.labelKey ?? card.id);

          return (
            <Pressable
              key={card.id}
              accessibilityRole="button"
              accessibilityLabel={label}
              onPress={() => onPressCategory?.(card.id)}
              style={styles.card}
            >
              <Image
                source={card.image}
                resizeMode="cover"
                style={styles.image}
              />
              <View pointerEvents="none" style={styles.overlay} />
              <View style={styles.labelGroup}>
                <Text numberOfLines={1} style={styles.label}>
                  {label}
                </Text>
                <Text style={styles.arrow}>→</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.space32 },
  heading: { ...typography.titleM, color: colors.text, marginBottom: 2 },
  description: {
    ...typography.label,
    color: colors.secondaryText,
    height: 20,
    marginBottom: spacing.space16,
  },
  cards: { rowGap: 6 },
  card: {
    width: "100%",
    height: 70,
    borderRadius: radius.radius8,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  image: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  labelGroup: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: spacing.space6,
    paddingRight: spacing.space16,
  },
  label: {
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 24,
    color: colors.background,
  },
  arrow: {
    fontSize: 18,
    fontWeight: "400",
    lineHeight: 24,
    color: colors.background,
  },
});
