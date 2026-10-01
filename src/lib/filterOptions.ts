import { API_BASE_URL } from '../constants/api';

export type FilterOption = { id: number; name: string };
export type CountryCode = 'KR' | 'JP';

const regionCache: Partial<Record<CountryCode, FilterOption[]>> = {};
const regionRequests: Partial<Record<CountryCode, Promise<FilterOption[]>>> = {};
let tagCache: FilterOption[] | undefined;
let tagRequest: Promise<FilterOption[]> | undefined;

async function requestOptions(path: string): Promise<FilterOption[]> {
  const response = await fetch(`${API_BASE_URL}${path}`);
  if (!response.ok) throw new Error('Filter options request failed');
  const body: unknown = await response.json();
  if (!Array.isArray(body) || !body.every((item) =>
    item && typeof item.id === 'number' && typeof item.name === 'string')) {
    throw new Error('Invalid filter options response');
  }
  return body as FilterOption[];
}

export function getRegions(countryCode: CountryCode): Promise<FilterOption[]> {
  if (regionCache[countryCode]) return Promise.resolve(regionCache[countryCode]);
  if (!regionRequests[countryCode]) {
    regionRequests[countryCode] = requestOptions(`/api/regions?countryCode=${countryCode}`)
      .then((regions) => {
        regionCache[countryCode] = regions;
        return regions;
      })
      .finally(() => { delete regionRequests[countryCode]; });
  }
  return regionRequests[countryCode];
}

export function getTags(): Promise<FilterOption[]> {
  if (tagCache) return Promise.resolve(tagCache);
  if (!tagRequest) {
    tagRequest = requestOptions('/api/tags')
      .then((tags) => {
        tagCache = tags;
        return tags;
      })
      .finally(() => { tagRequest = undefined; });
  }
  return tagRequest;
}
