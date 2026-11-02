import { useFocusEffect } from "expo-router";
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { ScrollView, Text, View, useWindowDimensions } from "react-native";
import { usePopupNavigation } from "../../hooks/usePopupNavigation";
import { useTranslation } from "../../hooks/useTranslation";
import { getSimilarPopups, type SimilarPopup } from "../../lib/similarPopups";
import {
  NearbyCard,
  nearbySectionStyles as styles,
} from "./PopupNearbySection";

export type SimilarSectionHandle = { checkVisibility: () => void };
type Props = { publicId: string };

// Same calendar-day precedence, labels and colors as the RN popup cards and web recommendations.
function similarDayStatus(
  popup: SimilarPopup,
  today: string,
  language: string,
) {
  const { startDate: start, endDate: end } = popup;
  const ja = language === "ja";
  const daysUntil = (date: string) =>
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
    86_400_000;
  if (end && end < today)
    return { label: ja ? "終了" : "종료", color: "#9CA3AF" };
  if (start && start > today)
    return {
      label: `${ja ? "オープン" : "오픈"} D-${daysUntil(start)}`,
      color: "#2563EB",
    };
  if (end === today)
    return { label: ja ? "本日終了" : "오늘 종료", color: "#C05621" };
  if (start === today)
    return { label: ja ? "本日オープン" : "오늘 오픈", color: "#16805D" };
  if (start && start < today && end && end > today)
    return {
      label: `${ja ? "終了" : "종료"} D-${daysUntil(end)}`,
      color: "#16805D",
    };
  return null;
}

export default forwardRef<SimilarSectionHandle, Props>(
  function PopupSimilarSection({ publicId }, ref) {
    const { t, resolvedLanguage } = useTranslation();
    const { width, height } = useWindowDimensions();
    const openPopup = usePopupNavigation();
    const section = useRef<View>(null);
    const active = useRef(false);
    const generation = useRef(0);
    const requested = useRef(false);
    const [result, setResult] = useState<SimilarPopup[] | null>(null);
    const checkVisibility = useCallback(() => {
      if (!active.current || requested.current) return;
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
        void getSimilarPopups(publicId).then((items) => {
          if (active.current && current === generation.current)
            setResult(items);
        });
      });
    }, [publicId, height]);
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
    if (result && !result.length) return null;
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
    // Both supported countries use UTC+09:00; keep date-only values out of local-time parsing.
    const today = new Date(Date.now() + 9 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    return (
      <View ref={section} collapsable={false}>
        <View style={styles.divider} />
        <Text accessibilityRole="header" style={styles.heading}>
          {t("place.detail.similarPopups")}
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
              dayStatus={similarDayStatus(popup, today, resolvedLanguage)}
              onPress={() => openPopup(popup.publicId)}
            />
          ))}
        </ScrollView>
      </View>
    );
  },
);
