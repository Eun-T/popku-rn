import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { MapPin } from "lucide-react-native";
import { useRef } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { useHomeVenues } from "../../hooks/useHomeVenues";
import { useTranslation } from "../../hooks/useTranslation";
import { radius, spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/useTheme";

export default function HomeVenueSection({ isActive = true, style }: {
  isActive?: boolean;
  style?: StyleProp<ViewStyle>;
} = {}) {
  const venues = useHomeVenues(isActive);
  const { t } = useTranslation();
  const { themeColors } = useTheme();
  const router = useRouter();
  const entrySequence = useRef(0);
  const { width } = useWindowDimensions();
  const cardWidth = width * 0.75;

  if (venues.length === 0) return null;

  return (
    <View style={[styles.section, style]}>
      <Text style={[styles.title, { color: themeColors.textPrimary }]}>
        {t("home.venues.title")}
      </Text>
      <ScrollView
        horizontal
        nestedScrollEnabled
        directionalLockEnabled
        showsHorizontalScrollIndicator={false}
        style={styles.list}
        contentContainerStyle={styles.content}
      >
        {venues.map((venue) => (
          <Pressable
            key={venue.venueId}
            accessibilityRole="button"
            accessibilityLabel={`${venue.name}, ${t("home.venues.count", { count: venue.popupCount })}`}
            style={{ width: cardWidth }}
            onPress={() =>
              router.navigate({
                pathname: "/(tabs)/places",
                params: {
                  tab: "all",
                  venueId: venue.venueId,
                  homeVenueEntry: `${Date.now()}-${++entrySequence.current}`,
                  homeNewEntry: "",
                  homeCategoryEntry: "",
                  countryCode: "all",
                  tagId: "",
                },
              })
            }
          >
            <View>
              <Image
                source={
                  venue.imageUrl
                    ? {
                        uri: venue.imageUrl,
                        cacheKey: venue.imageCacheKey ?? undefined,
                      }
                    : null
                }
                style={[styles.image, { backgroundColor: themeColors.surface }]}
                contentFit="cover"
                cachePolicy="memory-disk"
                recyclingKey={venue.venueId}
              />
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {t("home.venues.count", { count: venue.popupCount })}
                </Text>
              </View>
            </View>
            <View style={styles.info}>
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                style={[styles.name, { color: themeColors.textPrimary }]}
              >
                {venue.name}
              </Text>
              <View style={styles.addressRow}>
                {/* <MapPin size={14} color={themeColors.textSecondary} /> */}
                <Text
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  style={[styles.address, { color: themeColors.textSecondary }]}
                >
                  {venue.address}
                </Text>
              </View>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: spacing.space40 },
  title: { ...typography.titleM, paddingHorizontal: spacing.space16 },
  list: { marginTop: spacing.space16, flexGrow: 0 },
  content: { paddingHorizontal: spacing.space16, columnGap: spacing.space16 },
  image: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderTopLeftRadius: radius.radius12,
    borderTopRightRadius: radius.radius12,
  },
  info: {
    backgroundColor: "#F5F5F5",
    borderBottomLeftRadius: radius.radius12,
    borderBottomRightRadius: radius.radius12,
    paddingHorizontal: spacing.space12,
    paddingVertical: spacing.space12,
  },
  badge: {
    position: "absolute",
    top: spacing.space12,
    right: spacing.space12,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    borderRadius: radius.full,
    paddingHorizontal: spacing.space10,
    paddingVertical: spacing.space4,
  },
  badgeText: { ...typography.caption, fontSize: 13, color: "#FFFFFF" },
  name: {
    ...typography.label,
    fontSize: typography.label.fontSize + 2,
    fontWeight: "600",
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: spacing.space4,
    marginTop: spacing.space2,
  },
  address: { ...typography.caption, fontSize: 13, flex: 1, minWidth: 0 },
});
