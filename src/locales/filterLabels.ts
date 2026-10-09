import { getLocale, translate, type Locale } from './index';

// IDs verified against /api/regions and /api/tags. Display metadata only;
// API objects, filter values and cache keys remain unchanged.
export const regionLabels = [
  { id: 1, countryCode: 'KR', key: 'seongsu' },
  { id: 2, countryCode: 'KR', key: 'yeouido' },
  { id: 3, countryCode: 'KR', key: 'jamsil' },
  { id: 4, countryCode: 'KR', key: 'hongdae' },
  { id: 5, countryCode: 'KR', key: 'gangnam' },
  { id: 6, countryCode: 'KR', key: 'yongsan' },
  { id: 7, countryCode: 'KR', key: 'otherSeoul' },
  { id: 8, countryCode: 'KR', key: 'gyeonggiIncheon' },
  { id: 9, countryCode: 'KR', key: 'busan' },
  { id: 10, countryCode: 'KR', key: 'daeguGyeongbuk' },
  { id: 11, countryCode: 'KR', key: 'daejeonChungcheong' },
  { id: 12, countryCode: 'KR', key: 'gwangjuJeolla' },
  { id: 13, countryCode: 'KR', key: 'gangwon' },
  { id: 14, countryCode: 'KR', key: 'jeju' },
  { id: 15, countryCode: 'JP', key: 'tokyo' },
  { id: 16, countryCode: 'JP', key: 'osaka' },
  { id: 17, countryCode: 'JP', key: 'kyoto' },
  { id: 18, countryCode: 'JP', key: 'nagoya' },
  { id: 19, countryCode: 'JP', key: 'fukuoka' },
  { id: 20, countryCode: 'JP', key: 'sapporo' },
  { id: 21, countryCode: 'JP', key: 'otherJapan' },
] as const;

export const tagLabels = [
  { id: 1, key: 'animeCharacter' },
  { id: 2, key: 'game' },
  { id: 3, key: 'entertainment' },
  { id: 4, key: 'fashion' },
  { id: 5, key: 'beauty' },
  { id: 6, key: 'foodBeverage' },
  { id: 7, key: 'exhibitionArt' },
  { id: 8, key: 'stationery' },
  { id: 9, key: 'lifestyle' },
  { id: 10, key: 'familyPet' },
  { id: 11, key: 'other' },
] as const;

type Region = { id: number | null; name: string | null; countryCode?: string };
type Tag = { id: number; name: string };

export function getRegionDisplayName(region: Region, language: Locale = getLocale()): string {
  const label = regionLabels.find(item => item.id === region.id
    && (region.countryCode === undefined || item.countryCode === region.countryCode));
  if (!label) return region.name ?? '';
  if (language === 'ko' && region.name) return region.name;
  return translate(language, `place.filters.regions.${label.key}`);
}

export function getPopupRegionDisplayName(popup: {
  regionId: number | null; regionName: string | null; countryCode: string;
}, language: Locale = getLocale()): string {
  // Preserve the existing empty-location UI when the popup has no region name.
  if (!popup.regionName?.trim()) return popup.regionName ?? '';
  return getRegionDisplayName({ id: popup.regionId, name: popup.regionName, countryCode: popup.countryCode }, language);
}

export function getTagDisplayName(tag: Tag, language: Locale = getLocale()): string {
  const label = tagLabels.find(item => item.id === tag.id);
  if (!label) return tag.name;
  if (language === 'ko' && tag.name) return tag.name;
  return translate(language, `place.filters.interests.${label.key}`);
}

// Static explore tiles have local IDs; resolve them to the verified API IDs,
// never by a translated name.
export function getExploreRegionId(key: string): number | undefined {
  return regionLabels.find(item => item.key === key)?.id;
}

export function getExploreTagId(key: string): number | undefined {
  return tagLabels.find(item => item.key === key)?.id;
}
