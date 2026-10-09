import { useTranslation } from '../../hooks/useTranslation';
import { getTagDisplayName } from '../../locales/filterLabels';
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { PopupMapMarker } from "../../lib/popups";
import { popupOperatingStatus } from "../../lib/popupStatus";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import Tag from "../common/Tag";
import { displayDate } from "../home/HomeNewPopupSection";

type MapPopupListSheetProps = {
  popups: readonly PopupMapMarker[];
  bottomPadding: number;
  onPopupPress: (id: string) => void;
  status?: "loading" | "ready" | "error";
  onRetry?: () => void;
};

const placeholderImage = require("../../../assets/images/ranking-placeholder.png");

function PopupListItem({
  popup,
  onPress,
}: {
  popup: PopupMapMarker;
  onPress: () => void;
}) {
  const { t, resolvedLanguage } = useTranslation();
  const status = popupOperatingStatus(popup.startDate, popup.endDate);
  const period =
    [
      popup.startDate
        ? `${popup.startDate.slice(2, 4)}.${displayDate(popup.startDate)}`
        : null,
      popup.endDate ? displayDate(popup.endDate) : null,
    ]
      .filter(Boolean)
      .join(" ~ ") || t("place.detail.schedulePending");
  const statusLabel =
    status === "오픈 예정"
      ? t("place.all.card.upcoming")
      : status === "종료"
        ? t("place.all.card.ended")
        : t("place.all.card.ongoing");
  const statusColor =
    status === "운영 중"
      ? colors.primaryDark
      : status === "오픈 예정"
        ? colors.infoDark
        : colors.secondaryText;
  const statusBackground =
    status === "운영 중"
      ? colors.primaryLight
      : status === "오픈 예정"
        ? colors.infoLight
        : "#F3F4F6";

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.item}>
      <Image
        source={
          popup.coverImageUrl ? { uri: popup.coverImageUrl } : placeholderImage
        }
        resizeMode="cover"
        style={styles.image}
      />
      <View style={styles.details}>
        <View style={styles.tags}>
          {status && (
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: statusBackground },
              ]}
            >
              <Text
                numberOfLines={1}
                style={[styles.statusText, { color: statusColor }]}
              >
                {statusLabel}
              </Text>
            </View>
          )}
          {(popup.tags ?? []).slice(0, 2).map((tag) => (
            <Tag key={tag.id} label={getTagDisplayName(tag, resolvedLanguage)} />
          ))}
        </View>
        <Text numberOfLines={2} ellipsizeMode="tail" style={styles.title}>
          {popup.name}
        </Text>
        <Text numberOfLines={1} style={styles.period}>
          {period}
        </Text>
      </View>
    </Pressable>
  );
}

export default function MapPopupListSheet({
  popups,
  bottomPadding,
  onPopupPress,
  status = "ready",
  onRetry,
}: MapPopupListSheetProps) {
  const { t, resolvedLanguage } = useTranslation();
  return (
    <FlatList
      style={styles.list}
      data={popups}
      extraData={resolvedLanguage}
      keyExtractor={(popup) => popup.id}
      renderItem={({ item }) => (
        <PopupListItem popup={item} onPress={() => onPopupPress(item.id)} />
      )}
      contentContainerStyle={[
        styles.listContent,
        { paddingBottom: bottomPadding + 16 },
      ]}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          {status === "error" ? (
            <Pressable accessibilityRole="button" onPress={onRetry}>
              <Text style={styles.emptyText}>
                {t("place.explore.loadFailedRetry")}
              </Text>
            </Pressable>
          ) : (
            <Text style={styles.emptyText}>
              {status === "loading"
                ? t("map.listLoading")
                : t("map.listEmpty")}
            </Text>
          )}
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
  },
  item: {
    flexDirection: "row",
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  image: {
    width: 88,
    aspectRatio: 4 / 5,
    borderRadius: radius.radius8,
  },
  details: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    gap: 6,
  },
  tags: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.space4,
    overflow: "hidden",
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 20,
    color: colors.text,
  },
  statusBadge: {
    flexShrink: 0,
    alignItems: "center",
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  statusText: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: "600",
    flexShrink: 0,
    lineHeight: 16,
  },
  period: {
    flexShrink: 1,
    color: colors.secondaryText,
    fontSize: 12,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: colors.secondaryText,
    fontSize: 14,
  },
});
