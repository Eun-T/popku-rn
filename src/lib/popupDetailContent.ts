import type { SocialChannel } from '../components/place/OfficialChannelIcon';
import type { PopupHighlight, PopupHighlightType } from './popups';

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
