import { useTranslation } from '../../hooks/useTranslation';
import { Image } from "expo-image";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from "react-native";

import { interestFilters, type InterestId } from "../../constants/placeFilters";
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
  const { t } = useTranslation();
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
            t(filter?.labelKey ?? card.id);

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
                contentFit="cover"
                cachePolicy="memory-disk"
                style={styles.image}
              />
              <View pointerEvents="none" style={styles.overlay}>
                <Svg width="100%" height="100%">
                  <Defs>
                    <LinearGradient id="categoryShade" x1="0" y1="0.5" x2="1" y2="0.5">
                      <Stop offset="0" stopColor="#000000" stopOpacity="0.25" />
                      <Stop offset="0.5" stopColor="#000000" stopOpacity="0.35" />
                      <Stop offset="1" stopColor="#000000" stopOpacity="0.60" />
                    </LinearGradient>
                  </Defs>
                  <Rect width="100%" height="100%" fill="url(#categoryShade)" />
                </Svg>
              </View>
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
