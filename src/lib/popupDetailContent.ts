import type { SocialChannel } from '../components/place/OfficialChannelIcon';
import type { PopupHighlight, PopupHighlightType, PublicPopupDetail } from './popups';

export type PopupIntroductionSection = {
  kind: 'about' | 'attractions' | 'products' | 'benefits' | 'notice';
  titleKey: string;
  paragraphs: readonly string[];
};

type IntroductionKind = 'about' | 'attractions' | 'products';

const introductionHeadings = new Map<string, IntroductionKind>([
  ['팝업 소개', 'about'], ['볼거리', 'attractions'], ['판매 상품', 'products'],
  ['ポップアップ紹介', 'about'], ['見どころ', 'attractions'], ['販売商品', 'products'],
]);

const introductionTitleKeys = {
  about: 'place.detail.about',
  attractions: 'place.detail.introduction.attractions',
  products: 'place.detail.introduction.products',
} as const;

// Only standalone headings are delimiters. Slice the original string so body
// whitespace, paragraphs and CRLF/LF line breaks survive without normalization.
export function parsePopupIntroduction(value: unknown): PopupIntroductionSection[] {
  const text = popupSummary(value);
  if (text === null) return [];
  const sections: PopupIntroductionSection[] = [];
  let kind: IntroductionKind = 'about';
  let bodyStart = 0;
  const append = (bodyEnd: number) => {
    const body = text.slice(bodyStart, bodyEnd);
    if (body.trim()) sections.push({ kind, titleKey: introductionTitleKeys[kind], paragraphs: [body] });
  };
  for (const line of text.matchAll(/[^\r\n]*(?:\r\n|\n|\r|$)/g)) {
    const heading = introductionHeadings.get(line[0].trim());
    if (!heading) continue;
    append(line.index);
    kind = heading;
    bodyStart = line.index + line[0].length;
  }
  append(text.length);
  return sections;
}

export function popupIntroductionSections(
  detail: Pick<PublicPopupDetail, 'summary' | 'highlights' | 'benefits' | 'notice'>,
): PopupIntroductionSection[] {
  // Legacy highlights remain in API data but are not part of the introduction.
  // Keep summary intact, including its paragraphs and authored line breaks.
  const candidates: PopupIntroductionSection[] = [
    { kind: 'about', titleKey: 'place.detail.about', paragraphs: [popupSummary(detail.summary)].filter((text): text is string => text !== null) },
    { kind: 'benefits', titleKey: 'place.detail.benefitsGuide', paragraphs: [popupSummary(detail.benefits)].filter((text): text is string => text !== null) },
    { kind: 'notice', titleKey: 'place.detail.notice', paragraphs: [popupSummary(detail.notice)].filter((text): text is string => text !== null) },
  ];
  return candidates.filter(section => section.paragraphs.length > 0);
}

export const highlightHeadings = {
  SPECIAL: { key: 'place.detail.highlights.SPECIAL', emoji: '✨' },
  GOODS: { key: 'place.detail.highlights.GOODS', emoji: '🎁' },
  PRODUCTS: { key: 'place.detail.highlights.PRODUCTS', emoji: '🛍️' },
  VIEW: { key: 'place.detail.highlights.VIEW', emoji: '👀' },
  EXPERIENCE: { key: 'place.detail.highlights.EXPERIENCE', emoji: '🎨' },
  FOOD: { key: 'place.detail.highlights.FOOD', emoji: '🍴' },
  SPACE: { key: 'place.detail.highlights.SPACE', emoji: '🏠' },
  HIGHLIGHT: { key: 'place.detail.highlights.HIGHLIGHT', emoji: '📌' },
} as const satisfies Record<PopupHighlightType, { key: string; emoji: string }>;

export function highlightHeading(type: unknown) {
  return typeof type === 'string' && Object.prototype.hasOwnProperty.call(highlightHeadings, type)
    ? highlightHeadings[type as PopupHighlightType] : highlightHeadings.HIGHLIGHT;
}

export function popupSummary(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

export function visiblePopupHighlights(value: unknown): PopupHighlight[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object' || !('text' in item) || typeof item.text !== 'string' || !item.text.trim()) return [];
    const type = 'type' in item && typeof item.type === 'string' && Object.prototype.hasOwnProperty.call(highlightHeadings, item.type)
      ? item.type as PopupHighlightType : 'HIGHLIGHT';
    return [{ type, text: item.text }];
  });
}

const socialChannelOrder: readonly SocialChannel[] = ['website', 'instagram', 'x', 'youtube', 'threads', 'facebook'];
const socialChannelLabels = { instagram: 'Instagram', x: 'X', youtube: 'YouTube', threads: 'Threads', facebook: 'Facebook' };

export function officialChannelLabel(channel: SocialChannel, translate: (key: string) => string) {
  return channel === 'website' ? translate('place.detail.website') : socialChannelLabels[channel];
}

export function isValidExternalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && !!url.hostname;
  } catch {
    return false;
  }
}

export function officialChannelLinks(value: unknown): { channel: SocialChannel; url: string }[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const data = value as Record<string, unknown>;
  return socialChannelOrder.flatMap((channel) => {
    const url = data[channel];
    return typeof url === 'string' && isValidExternalUrl(url.trim()) ? [{ channel, url: url.trim() }] : [];
  });
}
