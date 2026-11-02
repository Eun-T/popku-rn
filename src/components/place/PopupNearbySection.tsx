import { Image } from "expo-image";
import { useFocusEffect } from "expo-router";
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { usePopupNavigation } from "../../hooks/usePopupNavigation";
import { useTranslation } from "../../hooks/useTranslation";
import { getNearbyPopups, type NearbyPopup } from "../../lib/nearbyPopups";
import { colors } from "../../theme/tokens";

export type NearbySectionHandle = { checkVisibility: () => void };
type Props = {
  publicId: string;
  latitude: number | null;
  longitude: number | null;
};

type CardPopup = Omit<NearbyPopup, "distanceMeters"> & {
  distanceMeters?: number;
};
export function NearbyCard({
  popup,
  width,
  onPress,
  dayStatus,
  children,
}: {
  popup: CardPopup;
  width: number;
  onPress: () => void;
  dayStatus?: { label: string; color: string } | null;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  const distance =
    popup.distanceMeters === undefined
      ? null
      : popup.distanceMeters < 1000
        ? `${Math.round(popup.distanceMeters)}m`
        : `${(popup.distanceMeters / 1000).toFixed(1)}km`;
  const date = (value: string | null, withYear = false) => {
    if (!value) return t("place.detail.schedulePending");
    const [year, month, day] = value.split("-");
    return `${withYear ? `${year.slice(-2)}년 ` : ""}${Number(month)}월 ${Number(day)}일`;
  };
  const differentYear = Boolean(
    popup.startDate &&
    popup.endDate &&
    popup.startDate.slice(0, 4) !== popup.endDate.slice(0, 4),
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("place.explore.viewDetails", { title: popup.name })}
      onPress={onPress}
      style={{ width }}
    >
      <View style={styles.poster}>
        {popup.coverImageUrl && !failed ? (
          <Image
            source={{ uri: popup.coverImageUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
            onError={() => setFailed(true)}
            accessible={false}
          />
        ) : (
          <Text style={styles.imageState}>
            {t("place.detail.nearbyImageUnavailable")}
          </Text>
        )}
      </View>
      {dayStatus && (
        <Text
          numberOfLines={1}
          style={[styles.dayStatus, { color: dayStatus.color }]}
        >
          {dayStatus.label}
        </Text>
      )}
      <Text numberOfLines={1} style={styles.cardTitle}>
        {popup.name}
      </Text>
      <Text numberOfLines={1} style={styles.period}>
        {date(popup.startDate)} - {date(popup.endDate, differentYear)}
      </Text>
      {children}
      {distance !== null && (
        <View style={styles.locationBadges}>
          <Text numberOfLines={1} style={styles.locationBadge}>
            {t("place.detail.nearbyDistance", { distance })}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export default forwardRef<NearbySectionHandle, Props>(
  function PopupNearbySection({ publicId, latitude, longitude }, ref) {
    const { t } = useTranslation();
    const { width, height } = useWindowDimensions();
    const openPopup = usePopupNavigation();
    const section = useRef<View>(null);
    const active = useRef(false);
    const generation = useRef(0);
    const requested = useRef(false);
    const [result, setResult] = useState<NearbyPopup[] | null>(null);
    const validCoordinates =
      latitude !== null &&
      longitude !== null &&
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      Math.abs(latitude) <= 90 &&
      Math.abs(longitude) <= 180;
    const checkVisibility = useCallback(() => {
      if (!active.current || requested.current || !validCoordinates) return;
      const current = generation.current;
      section.current?.measureInWindow((_x, y, _width, sectionHeight) => {
        if (
          !active.current ||
          current !== generation.current ||
          requested.current ||
          y > height + 300 ||
          y + sectionHeight < -300
        )
          return;
        requested.current = true;
        void getNearbyPopups(publicId).then((items) => {
          if (active.current && current === generation.current)
            setResult(items);
        });
      });
    }, [publicId, height, validCoordinates]);
    useImperativeHandle(ref, () => ({ checkVisibility }), [checkVisibility]);
    useFocusEffect(
      useCallback(() => {
        active.current = true;
        requested.current = false;
        checkVisibility();
        return () => {
          active.current = false;
          generation.current++;
        };
      }, [checkVisibility]),
    );
    if (!validCoordinates || (result && !result.length)) return null;
    if (!result)
      return (
        <View
          ref={section}
          collapsable={false}
          onLayout={checkVisibility}
          style={{ height: 1 }}
        />
      );
    const cardWidth = (width - 16 * 2 - 12) / 2;
    return (
      <View ref={section} collapsable={false}>
        <View style={styles.divider} />
        <Text accessibilityRole="header" style={styles.heading}>
          {t("place.detail.nearbyPopups")}
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          directionalLockEnabled
          contentContainerStyle={styles.track}
        >
          {result.map((popup) => (
            <NearbyCard
              key={popup.publicId}
              popup={popup}
              width={cardWidth}
              onPress={() => openPopup(popup.publicId)}
            />
          ))}
        </ScrollView>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  divider: { marginVertical: 24, height: 8, backgroundColor: "#F5F6F8" },
  heading: {
    marginHorizontal: 16,
    marginBottom: 16,
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 28,
    color: "#111827",
  },
  track: { paddingHorizontal: 16, gap: 12 },
  poster: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: 5,
    overflow: "hidden",
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  imageState: { fontSize: 13, lineHeight: 20, color: "#6B7280" },
  cardTitle: {
    marginTop: 0,
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 24,
    color: "#111827",
  },
  dayStatus: { marginTop: 12, fontSize: 13, fontWeight: "600", lineHeight: 20 },
  period: {
    marginTop: 0,
    fontSize: 13,
    fontWeight: "400",
    lineHeight: 20,
    color: "#6B7280",
  },
  location: { fontSize: 13, lineHeight: 20, color: "#6B7280" },
  locationBadges: { marginTop: 4, flexDirection: "row", flexWrap: "wrap", gap: 4 },
  locationBadge: {
    maxWidth: "100%",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 5,
    backgroundColor: "#F5F5F7",
    color: colors.text,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 18,
  },
});

export { styles as nearbySectionStyles };
