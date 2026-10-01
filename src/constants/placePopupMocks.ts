import type { ImageSourcePropType } from 'react-native';

import type { CountryCode } from './placeFilters';

export type PopupGridItem = {
  id: string;
  poster: ImageSourcePropType;
  titleKey: string;
  country: CountryCode;
  regionKey: string;
  interestKey: string;
  startsOn: string;
  endsOn: string;
  backgroundColor?: string;
};

export type PopupDetailMock = {
  images: readonly ImageSourcePropType[];
  latitude?: number;
  longitude?: number;
  favoriteCount: number;
  rating: number;
  reviewCount: number;
  openingHours: string;
  address: string;
  reservation?: { opensAt: string; url?: string };
  notice?: { title: string; preview: string };
  benefit?: string;
  introduction?: string;
  introductionImages?: readonly string[];
  socialLinks?: PopupSocialLinks;
};

export type PopupSocialLinks = {
  instagram?: string;
  x?: string;
  youtube?: string;
  threads?: string;
  facebook?: string;
};

const placeholderPoster = require('../../assets/images/ranking-placeholder.png');
const bannerPoster = require('../../assets/images/banner_01.jpg');

function localDateOffset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const todayOpeningPopupMocks: readonly PopupGridItem[] = [
  {
    id: 'today-kr-1',
    poster: placeholderPoster,
    titleKey: 'place.all.mock.seongsuArt',
    country: 'KR',
    regionKey: 'place.filters.regions.seongsu',
    interestKey: 'place.filters.interests.exhibitionArt',
    startsOn: localDateOffset(0),
    endsOn: localDateOffset(10),
    backgroundColor: '#DDF5E5',
  },
  {
    id: 'today-jp-1',
    poster: bannerPoster,
    titleKey: 'place.all.mock.tokyoGame',
    country: 'JP',
    regionKey: 'place.filters.regions.tokyo',
    interestKey: 'place.filters.interests.game',
    startsOn: localDateOffset(0),
    endsOn: localDateOffset(14),
    backgroundColor: '#F5E8D9',
  },
];

export const placePopupMocks: readonly PopupGridItem[] = [
  {
    id: 'place-kr-1',
    poster: placeholderPoster,
    titleKey: 'place.all.mock.seongsuArt',
    country: 'KR',
    regionKey: 'place.filters.regions.seongsu',
    interestKey: 'place.filters.interests.exhibitionArt',
    startsOn: '2026-10-06',
    endsOn: '2026-10-11',
  },
  {
    id: 'place-jp-1',
    poster: placeholderPoster,
    titleKey: 'place.all.mock.tokyoGame',
    country: 'JP',
    regionKey: 'place.filters.regions.tokyo',
    interestKey: 'place.filters.interests.game',
    startsOn: '2026-09-20',
    endsOn: '2026-10-15',
  },
  {
    id: 'place-kr-2',
    poster: placeholderPoster,
    titleKey: 'place.all.mock.hongdaeFashion',
    country: 'KR',
    regionKey: 'place.filters.regions.hongdae',
    interestKey: 'place.filters.interests.fashion',
    startsOn: '2026-09-23',
    endsOn: '2026-10-03',
  },
  {
    id: 'place-jp-2',
    poster: placeholderPoster,
    titleKey: 'place.all.mock.osakaBeauty',
    country: 'JP',
    regionKey: 'place.filters.regions.osaka',
    interestKey: 'place.filters.interests.beauty',
    startsOn: '2026-10-02',
    endsOn: '2026-10-17',
  },
  {
    id: 'place-kr-3',
    poster: placeholderPoster,
    titleKey: 'place.all.mock.busanLifestyle',
    country: 'KR',
    regionKey: 'place.filters.regions.busan',
    interestKey: 'place.filters.interests.lifestyle',
    startsOn: '2026-09-01',
    endsOn: '2026-09-15',
  },
  {
    id: 'place-jp-3',
    poster: placeholderPoster,
    titleKey: 'place.all.mock.kyotoCharacter',
    country: 'JP',
    regionKey: 'place.filters.regions.kyoto',
    interestKey: 'place.filters.interests.animeCharacter',
    startsOn: '2026-09-26',
    endsOn: '2026-10-08',
  },
];

export const placePopupDetailMocks: Readonly<Partial<Record<string, PopupDetailMock>>> = {
  'today-kr-1': {
    images: [placeholderPoster, bannerPoster],
    latitude: 37.5446,
    longitude: 127.0557,
    favoriteCount: 31,
    rating: 4.8,
    reviewCount: 12,
    openingHours: '매일 11:00 - 20:00',
    address: '서울 성동구 성수이로 00, 1층',
    reservation: { opensAt: '09.28(월) 13:00 오픈' },
    notice: { title: '굿즈 구매 관련 안내', preview: '일부 상품은 구매 수량이 제한됩니다.' },
    benefit: '방문 시 한정 포토카드를 증정합니다.',
    introduction: '성수에서 진행되는 컬러 아트 팝업입니다. 다양한 작품과 한정 굿즈를 만나볼 수 있어요.',
    introductionImages: [
      'https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=1200&q=80',
      'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?w=1200&q=80',
      'https://images.unsplash.com/photo-1561214115-f2f134cc4912?w=1200&q=80',
    ],
    // Platform homepages are safe UI test links until this mock has real popup accounts.
    socialLinks: {
      instagram: 'https://www.instagram.com/',
      x: 'https://x.com/',
      youtube: 'https://www.youtube.com/',
    },
  },
  'today-jp-1': {
    images: [bannerPoster, placeholderPoster],
    latitude: 35.6704,
    longitude: 139.7027,
    favoriteCount: 54,
    rating: 4.6,
    reviewCount: 8,
    openingHours: '매일 10:00 - 19:00',
    address: '도쿄도 시부야구 진구마에 0-0-0',
    introduction: '도쿄 게임 월드 팝업에서 인기 게임의 세계를 직접 경험해 보세요. 전시와 체험 공간을 천천히 둘러볼 수 있습니다.',
  },
};
