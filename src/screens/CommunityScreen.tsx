import { Pencil, Settings } from "lucide-react-native";
import { useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import CommunityPostItem from "../components/community/CommunityPostItem";
import {
  FLOATING_TAB_BAR_BOTTOM_GAP,
  FLOATING_TAB_BAR_HEIGHT,
} from "../components/navigation/FloatingTabBar";
import {
  communityPostMocks,
  type CommunityCategory,
} from "../constants/communityPostMocks";
import { t } from "../locales";
import { communityColors } from "../theme/communityColors";
import { radius, spacing, typography } from "../theme/tokens";

type CategoryFilter = "all" | CommunityCategory;
type SortOrder = "latest" | "popular";

const categories: readonly CategoryFilter[] = [
  "all",
  "review",
  "info",
  "question",
];
const sortOrders: readonly SortOrder[] = ["latest", "popular"];

export default function CommunityScreen() {
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [sort, setSort] = useState<SortOrder>("latest");
  const insets = useSafeAreaInsets();
  const horizontalPadding = {
    paddingLeft: spacing.space16 + insets.left,
    paddingRight: spacing.space16 + insets.right,
  };

  const posts = useMemo(
    () =>
      communityPostMocks
        .filter((post) => category === "all" || post.category === category)
        .sort((a, b) =>
          sort === "latest"
            ? a.minutesAgo - b.minutesAgo
            : b.likes - a.likes || a.minutesAgo - b.minutesAgo,
        ),
    [category, sort],
  );

  return (
    <SafeAreaView edges={["top"]} style={styles.container}>
      <View style={[styles.header, horizontalPadding]}>
        <Text style={styles.title}>{t("community.title")}</Text>
        <View
          accessibilityLabel={t("community.settings")}
          style={styles.headerIcon}
        >
          <Settings size={24} color={communityColors.text} />
        </View>
      </View>

      <FlatList
        style={styles.list}
        data={posts}
        keyExtractor={(post) => post.id}
        renderItem={({ item }) => <CommunityPostItem post={item} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        contentContainerStyle={[
          styles.listContent,
          horizontalPadding,
          {
            paddingBottom:
              insets.bottom +
              FLOATING_TAB_BAR_BOTTOM_GAP +
              FLOATING_TAB_BAR_HEIGHT +
              spacing.space40,
          },
        ]}
        ListHeaderComponent={
          <View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryRow}
              style={styles.categoryScroll}
            >
              {categories.map((item) => {
                const selected = category === item;
                return (
                  <Pressable
                    key={item}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setCategory(item)}
                    style={[
                      styles.categoryChip,
                      selected && styles.selectedChip,
                    ]}
                  >
                    <Text
                      style={[
                        styles.categoryText,
                        selected && styles.selectedCategoryText,
                      ]}
                    >
                      {t(`community.category.${item}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.sortRow}>
              {sortOrders.map((item) => {
                const selected = sort === item;
                return (
                  <Pressable
                    key={item}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setSort(item)}
                  >
                    <Text
                      style={[
                        styles.sortText,
                        selected && styles.selectedSortText,
                      ]}
                    >
                      {t(`community.sort.${item}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        }
      />

      <View
        style={[
          styles.writeButton,
          {
            right: spacing.space16 + insets.right,
            bottom:
              insets.bottom +
              FLOATING_TAB_BAR_BOTTOM_GAP +
              FLOATING_TAB_BAR_HEIGHT +
              spacing.space16,
          },
        ]}
        accessibilityLabel={t("community.write")}
      >
        <Pencil size={18} color={communityColors.white} />
        <Text style={styles.writeText}>{t("community.write")}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: spacing.space8,
    backgroundColor: communityColors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.space12,
  },
  title: { ...typography.titleL, color: communityColors.text },
  headerIcon: {
    width: 24,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  list: { flex: 1 },
  listContent: { flexGrow: 1 },
  categoryScroll: { marginTop: spacing.space12 },
  categoryRow: { flexDirection: "row", columnGap: spacing.space8 },
  categoryChip: {
    height: 36,
    paddingHorizontal: spacing.space16,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: communityColors.mutedSurface,
    backgroundColor: communityColors.mutedSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  selectedChip: { borderColor: communityColors.charcoal, backgroundColor: communityColors.charcoal },
  categoryText: { ...typography.label, color: communityColors.text },
  selectedCategoryText: { color: communityColors.white },
  sortRow: {
    flexDirection: "row",
    columnGap: spacing.space20,
    marginTop: spacing.space24,
  },
  sortText: { ...typography.label, color: communityColors.secondaryText },
  selectedSortText: { fontWeight: "700", color: communityColors.charcoal },
  separator: { height: 1, backgroundColor: communityColors.divider },
  writeButton: {
    position: "absolute",
    height: 48,
    paddingHorizontal: spacing.space16,
    flexDirection: "row",
    alignItems: "center",
    columnGap: spacing.space8,
    borderRadius: radius.full,
    backgroundColor: communityColors.charcoal,
    shadowColor: "#000000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  writeText: {
    ...typography.label,
    fontWeight: "600",
    color: communityColors.white,
  },
});
