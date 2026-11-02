import { ChevronDown } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { useTranslation } from "../../hooks/useTranslation";
import type { PopupIntroductionSection } from "../../lib/popupDetailContent";
import { colors, spacing, typography } from "../../theme/tokens";
// Roll back the iOS experiment by restoring ../community/CommunityPostMenu here.
import CommunityPostMenu from "./PopupGuidanceSheet";

type Props = {
  sections: readonly PopupIntroductionSection[];
  detailImages?: ReactNode;
};

export default function PopupIntroduction({ sections, detailImages }: Props) {
  const { t } = useTranslation();
  const { height } = useWindowDimensions();
  const [selectedKind, setSelectedKind] = useState<
    "notice" | "benefits" | null
  >(null);
  const introduction = sections.filter(
    (section) => section.kind !== "benefits" && section.kind !== "notice",
  );
  // Preserve authored single line breaks; space blank-line-delimited paragraphs.
  const paragraphs = introduction.flatMap((section) =>
    section.paragraphs.flatMap((text) =>
      text
        .split(/\r?\n(?:[\t ]*\r?\n)+|\r(?:[\t ]*\r)+/)
        .map((paragraph) =>
          paragraph.replace(/^(?:\r\n|\r|\n)+|(?:\r\n|\r|\n)+$/g, ""),
        )
        .filter((paragraph) => paragraph.trim().length > 0),
    ),
  );
  const guidance = [
    ...sections.filter((section) => section.kind === "notice"),
    ...sections.filter((section) => section.kind === "benefits"),
  ].filter((section) =>
    section.paragraphs.some((text) => text.trim().length > 0),
  );
  const selected = guidance.find((section) => section.kind === selectedKind);

  if (paragraphs.length === 0 && guidance.length === 0 && !detailImages)
    return null;

  return (
    <View
      style={(paragraphs.length > 0 || guidance.length > 0) && styles.container}
    >
      {paragraphs.length > 0 && (
        <View style={styles.content} testID="popup-introduction-content">
          {paragraphs.map((text, index) => (
            <Text
              key={index}
              style={styles.body}
              lineBreakStrategyIOS="hangul-word"
            >
              {text}
            </Text>
          ))}
        </View>
      )}
      {guidance.length > 0 && (
        <View
          style={[
            styles.buttons,
            paragraphs.length > 0 && styles.afterIntroduction,
          ]}
          testID="popup-guidance-buttons"
        >
          {guidance.map((section) => (
            <Pressable
              key={section.kind}
              accessibilityRole="button"
              accessibilityLabel={t(section.titleKey)}
              accessibilityState={{ expanded: selectedKind === section.kind }}
              onPress={() =>
                setSelectedKind(section.kind as "notice" | "benefits")
              }
              style={styles.buttonTouchTarget}
              testID={`popup-${section.kind}-button`}
            >
              <View style={styles.button} pointerEvents="none">
                <Text style={styles.buttonText}>{t(section.titleKey)}</Text>
                <ChevronDown size={16} color={colors.text} accessible={false} />
              </View>
            </Pressable>
          ))}
        </View>
      )}
      {detailImages}
      {selected && (
        <CommunityPostMenu
          edgeToEdge
          showEdit={false}
          showDelete={false}
          onSelect={() => setSelectedKind(null)}
          content={() => (
            <>
              <View style={styles.sheetHeader}>
                <Text accessibilityRole="header" style={styles.sheetTitle}>
                  {t(selected.titleKey)}
                </Text>
              </View>
              <ScrollView
                style={[styles.sheetScroll, { maxHeight: height * 0.65 }]}
                contentContainerStyle={styles.sheetContent}
                testID="popup-guidance-scroll"
              >
                {selected.paragraphs.map((text, index) => (
                  <Text
                    key={index}
                    style={styles.body}
                    lineBreakStrategyIOS="hangul-word"
                  >
                    {text}
                  </Text>
                ))}
              </ScrollView>
            </>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: spacing.space16 },
  content: { flexShrink: 0, gap: spacing.space12 },
  body: {
    ...typography.body,
    color: colors.text,
    fontSize: 14,
    lineHeight: 22,
  },
  buttons: { flexDirection: "row", flexWrap: "wrap", gap: spacing.space8 },
  afterIntroduction: { marginTop: spacing.space12 },
  buttonTouchTarget: { minHeight: 44, justifyContent: "center" },
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.space6,
    backgroundColor: "#EDEDED",
    borderRadius: 999,
    paddingHorizontal: spacing.space10,
    paddingVertical: spacing.space6,
  },
  buttonText: {
    ...typography.label,
    fontSize: 13,
    fontWeight: "500",
    color: colors.text,
  },
  // Keep the title's top offset from the former centered 44dp close-button row.
  sheetHeader: {
    flexDirection: "row",
    paddingTop: (44 - typography.titleS.lineHeight) / 2,
    marginBottom: spacing.space12,
  },
  sheetTitle: { ...typography.titleS, color: colors.text, flex: 1 },
  sheetScroll: { flexShrink: 1 },
  sheetContent: { gap: spacing.space12, paddingBottom: spacing.space16 },
});
