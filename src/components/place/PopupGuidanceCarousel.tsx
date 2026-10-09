import { useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import {
  guidanceIdentity,
  guidancePage,
  popupGuidanceItems,
  type PopupGuidanceItem,
} from "../../lib/popupGuidance";
import { useTranslation } from '../../hooks/useTranslation';
import { colors, radius, spacing } from "../../theme/tokens";

type Props = {
  popupId: string;
  languageCode: string;
  notice?: string | null;
  benefits?: string | null;
};

function GuidanceCard({
  item,
  pageNumber,
}: {
  item: PopupGuidanceItem;
  pageNumber?: number;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.card}>
      <View style={styles.heading}>
        <Text
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no"
          style={styles.emoji}
        >
          {item.emoji}
        </Text>
        <Text style={styles.title}>{t(item.titleKey)}</Text>
        {pageNumber !== undefined && (
          <Text style={styles.pagination}>{pageNumber}/2</Text>
        )}
      </View>
      <Text style={styles.body}>{item.text}</Text>
    </View>
  );
}

function GuidancePager({ items }: { items: readonly PopupGuidanceItem[] }) {
  const [width, setWidth] = useState(0);
  return (
    <View onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}>
      <MeasuredPager key={width} width={width} items={items} />
    </View>
  );
}

function MeasuredPager({
  width,
  items,
}: {
  width: number;
  items: readonly PopupGuidanceItem[];
}) {
  const [commonHeight, setCommonHeight] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const ready = width > 0 && commonHeight > 0;
  return (
    <View style={styles.viewport}>
      {/* Normal-flow row reserves max natural height on the first layout.
          Each half of the 200% row has exactly the viewport's width.
          It stays independent of the measured height to avoid feedback loops. */}
      <View
        pointerEvents="none"
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.measurement, ready && styles.hidden]}
        onLayout={({ nativeEvent }) =>
          setCommonHeight(nativeEvent.layout.height)
        }
      >
        {items.map((item, index) => (
          <View key={item.kind} style={styles.measurementPage}>
            <GuidanceCard item={item} pageNumber={index + 1} />
          </View>
        ))}
      </View>
      {ready && (
        <ScrollView
          horizontal
          pagingEnabled
          snapToInterval={width}
          snapToAlignment="start"
          disableIntervalMomentum
          decelerationRate="fast"
          bounces={false}
          overScrollMode="never"
          showsHorizontalScrollIndicator={false}
          style={[styles.pager, { height: commonHeight }]}
          onScroll={({ nativeEvent }) =>
            setActiveIndex(
              guidancePage(nativeEvent.contentOffset.x, width, items.length),
            )
          }
          scrollEventThrottle={16}
        >
          {items.map((item, index) => (
            <View
              key={item.kind}
              accessibilityElementsHidden={index !== activeIndex}
              importantForAccessibility={
                index === activeIndex ? "auto" : "no-hide-descendants"
              }
              style={{ width, height: commonHeight }}
            >
              <GuidanceCard item={item} pageNumber={index + 1} />
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

export default function PopupGuidanceCarousel({
  popupId,
  languageCode,
  notice,
  benefits,
}: Props) {
  const { t } = useTranslation();
  const { fontScale } = useWindowDimensions();
  const items = popupGuidanceItems(notice, benefits);
  if (items.length === 0) return null;
  return (
    <View style={styles.section}>
      {items.length === 1 ? (
        <GuidanceCard item={items[0]} />
      ) : (
        <GuidancePager
          key={`${guidanceIdentity(popupId, languageCode, items)}-${fontScale}`}
          items={items}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 24 },
  viewport: { overflow: "hidden" },
  measurement: { width: "200%", flexDirection: "row", alignItems: "stretch" },
  measurementPage: { flex: 1, minWidth: 0 },
  hidden: { opacity: 0 },
  pager: { position: "absolute", top: 0, left: 0, right: 0 },
  card: {
    flexGrow: 1,
    paddingVertical: 14,
    paddingHorizontal: spacing.space16,
    borderRadius: radius.radius12,
    backgroundColor: "#F7F8FA",
  },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: spacing.space6,
  },
  emoji: { fontSize: 16 },
  title: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    color: colors.text,
  },
  body: {
    marginTop: spacing.space6,
    fontSize: 13,
    lineHeight: 19,
    color: colors.secondaryText,
  },
  pagination: {
    flexShrink: 0,
    fontSize: 12,
    fontWeight: "400",
    lineHeight: 20,
    color: colors.inactiveTabText,
    textAlign: "right",
  },
});
