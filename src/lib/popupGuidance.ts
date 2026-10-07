export type PopupGuidanceItem = {
  kind: "notice" | "benefits";
  titleKey: "place.detail.notice" | "place.detail.benefits";
  emoji: string;
  text: string;
};

export function popupGuidanceItems(
  notice?: string | null,
  benefits?: string | null,
): PopupGuidanceItem[] {
  const items: PopupGuidanceItem[] = [];
  if (notice?.trim())
    items.push({
      kind: "notice",
      titleKey: "place.detail.notice",
      emoji: "📢",
      text: notice,
    });
  if (benefits?.trim())
    items.push({
      kind: "benefits",
      titleKey: "place.detail.benefits",
      emoji: "🎟️",
      text: benefits,
    });
  return items;
}

export function guidancePage(
  offset: number,
  width: number,
  count: number,
): number {
  return width > 0
    ? Math.max(0, Math.min(count - 1, Math.round(offset / width)))
    : 0;
}

export function guidanceIdentity(
  popupId: string,
  languageCode: string,
  items: readonly PopupGuidanceItem[],
): string {
  return JSON.stringify([popupId, languageCode, items]);
}
