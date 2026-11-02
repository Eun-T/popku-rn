import {
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { useHomePopups } from "../../hooks/useHomePopups";
import { useTranslation } from "../../hooks/useTranslation";
import { spacing, typography } from "../../theme/tokens";
import { useTheme } from "../../theme/useTheme";
import SkeletonBlock from "../common/SkeletonBlock";
import LatestPopupCard from "./LatestPopupCard";

type Props = { onPressPopup: (id: string) => void };

export function formatLatestPopupPeriod(start: string | null, end: string | null): string {
  // Use the API's calendar dates directly, including periods spanning different years.
  return [start, end]
    .map((date) => date
      ? `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`
      : "")
    .filter(Boolean)
    .join(" - ");
}

export default function HomeLatestPopupSection({ onPressPopup }: Props) {
  const { t, resolvedLanguage } = useTranslation();
  const { themeColors } = useTheme();
  const { width } = useWindowDimensions();
  const { status, popups, recoverCover } = useHomePopups("latest", "ALL");
  // Keep the existing card width independently of the full-width viewport.
  const cardWidth = (width - spacing.space16 * 2 - spacing.space12 * 2) / 2.3;

  if (status === "error" || (status === "ready" && popups.length === 0))
    return null;

  return (
    <View style={styles.section}>
      <Text style={[styles.title, { color: themeColors.textPrimary }]}>
        {t("home.latest.title")}
      </Text>
      <ScrollView
        horizontal
        nestedScrollEnabled
        directionalLockEnabled
        showsHorizontalScrollIndicator={false}
        style={styles.list}
        contentContainerStyle={styles.content}
      >
        {status === "loading" &&
          Array.from({ length: 3 }, (_, index) => (
            <View
              key={index}
              style={{ width: cardWidth }}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <SkeletonBlock
                backgroundColor={themeColors.skeletonBackground}
                width={cardWidth}
                height={cardWidth}
                borderRadius={5}
              />
              <SkeletonBlock
                backgroundColor={themeColors.skeletonBackground}
                width="90%"
                height={20}
                style={styles.skeletonTitle}
              />
              <SkeletonBlock
                backgroundColor={themeColors.skeletonBackground}
                width="80%"
                height={18}
                style={styles.skeletonPeriod}
              />
            </View>
          ))}
        {popups.slice(0, 7).map((popup) => (
          <LatestPopupCard
            key={popup.publicId}
            popup={popup}
            width={cardWidth}
            period={formatLatestPopupPeriod(popup.startDate, popup.endDate)}
            coverScope={`ALL:${resolvedLanguage}`}
            onRecoverCover={recoverCover}
            onPress={() => onPressPopup(popup.publicId)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.space32, paddingHorizontal: spacing.space16 },
  title: { ...typography.titleM },
  list: {
    marginTop: spacing.space16,
    marginHorizontal: -spacing.space16,
    flexGrow: 0,
  },
  content: { paddingHorizontal: spacing.space16, columnGap: spacing.space16 },
  skeletonTitle: { marginTop: spacing.space8 },
  skeletonPeriod: { marginTop: spacing.space4 },
});
