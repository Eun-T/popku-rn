import { useRouter } from "expo-router";
import { Store } from "lucide-react-native";
import { useRef } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from "react-native";

import { useTranslation } from "../../hooks/useTranslation";
import { getExploreTagId } from "../../locales/filterLabels";
import { spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/useTheme";

const categories = [
  { id: "all", labelKey: "community.category.all" },
  { id: "korea", labelKey: "place.filters.countries.kr" },
  { id: "japan", labelKey: "place.filters.countries.jp" },
  { id: "fashion", labelKey: "place.filters.interests.fashion" },
  { id: "beauty", labelKey: "place.filters.interests.beauty" },
  { id: "fnb", labelKey: "place.filters.interests.foodBeverage" },
] as const;

type CategoryId = (typeof categories)[number]["id"];

// Add static requires here only after the matching PNG files exist. See the asset folder README.
const categoryImages: Partial<Record<CategoryId, ImageSourcePropType>> = {
  all: require("../../../assets/images/home-categories/all.png"),
  korea: require("../../../assets/images/home-categories/korea.png"),
  japan: require("../../../assets/images/home-categories/japan.png"),
  fashion: require("../../../assets/images/home-categories/fashion.png"),
  beauty: require("../../../assets/images/home-categories/beauty.png"),
  fnb: require("../../../assets/images/home-categories/fnb.png"),
};

export default function HomeCategoryShortcuts() {
  const router = useRouter();
  const { t } = useTranslation();
  const { themeColors } = useTheme();
  const entrySequence = useRef(0);

  const openCategory = (id: CategoryId) => {
    const tagId = getExploreTagId(id === "fnb" ? "foodBeverage" : id);
    router.navigate({
      pathname: "/(tabs)/places",
      params: {
        tab: "all",
        countryCode: id === "korea" ? "KR" : id === "japan" ? "JP" : "all",
        tagId: tagId === undefined ? "" : String(tagId),
        homeCategoryEntry: `${Date.now()}-${++entrySequence.current}`,
        homeNewEntry: "",
        homeVenueEntry: "",
        venueId: "",
      },
    });
  };

  return (
    <View style={styles.section}>
      <Text style={[styles.title, { color: themeColors.textPrimary }]}>
        {t("home.categoriesTitle")}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        {categories.map(({ id, labelKey }) => (
          <Pressable
            key={id}
            accessibilityRole="button"
            accessibilityLabel={t(labelKey)}
            onPress={() => openCategory(id)}
            style={styles.item}
          >
            <View
              style={[styles.image, styles.imageShadow, { backgroundColor: themeColors.surface }]}
            >
              {categoryImages[id] ? (
                <Image
                  source={categoryImages[id]}
                  resizeMode="cover"
                  style={styles.image}
                />
              ) : (
                <Store size={24} color={themeColors.textSecondary} />
              )}
            </View>
            <Text style={[styles.label, { color: themeColors.textPrimary }]}>
              {t(labelKey)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: spacing.space28,
  },
  title: {
    ...typography.titleM,
    paddingHorizontal: spacing.space16,
  },
  container: {
    flexGrow: 0,
    marginTop: spacing.space16 - spacing.space8,
    marginBottom: -spacing.space8,
  },
  content: {
    paddingHorizontal: spacing.space16,
    paddingVertical: spacing.space8,
    columnGap: 26,
    alignItems: "flex-start",
  },
  item: {
    width: 64,
    flexShrink: 0,
    alignItems: "center",
    
  },
  image: {
    width: 72,
    height: 72,
    borderRadius: 36,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  
  },
  imageShadow: {
    overflow: "visible",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  label: {
    ...typography.caption,
    fontSize: 14,
    fontWeight: "500",
    marginTop: spacing.space6,
    textAlign: "center",
  },
});
