import type { ImageSourcePropType } from "react-native";

export type CommunityCategory = "review" | "info" | "question";

export type CommunityPost = {
  id: string;
  category: CommunityCategory;
  nickname: string;
  avatar?: ImageSourcePropType;
  minutesAgo: number;
  regionKey: string;
  bodyKey: string;
  place?: { id: string; nameKey: string };
  rating?: number;
  photos: readonly ImageSourcePropType[];
  likes: number;
  comments: number;
  views: number;
};

const poster = require("../../assets/images/ranking-placeholder.png");
const banner = require("../../assets/images/banner_01.jpg");

// 개발용 예시 데이터. 실제 사용자 게시글이나 팝업 API 응답이 아니다.
export const communityPostMocks: readonly CommunityPost[] = [
  {
    id: "community-mock-1",
    category: "review",
    nickname: "성수산책러",
    minutesAgo: 120,
    regionKey: "place.filters.regions.seongsu",
    bodyKey: "community.mock.body.seongsuReview",
    place: { id: "place-kr-1", nameKey: "place.all.mock.seongsuArt" },
    rating: 4.5,
    photos: [banner, poster, banner],
    likes: 24,
    comments: 8,
    views: 126,
  },
  {
    id: "community-mock-2",
    category: "info",
    nickname: "도쿄팝업현장소식전하는사람",
    avatar: poster,
    minutesAgo: 180,
    regionKey: "place.filters.regions.tokyo",
    bodyKey: "community.mock.body.tokyoInfo",
    place: { id: "place-jp-1", nameKey: "community.mock.place.longTokyo" },
    photos: [poster],
    likes: 38,
    comments: 12,
    views: 284,
  },
  {
    id: "community-mock-3",
    category: "question",
    nickname: "주말팝업찾는중",
    minutesAgo: 300,
    regionKey: "place.filters.regions.hongdae",
    bodyKey: "community.mock.body.hongdaeQuestion",
    place: { id: "place-kr-2", nameKey: "place.all.mock.hongdaeFashion" },
    photos: [],
    likes: 6,
    comments: 3,
    views: 72,
  },
  {
    id: "community-mock-4",
    category: "review",
    nickname: "오사카여행자",
    minutesAgo: 1440,
    regionKey: "place.filters.regions.osaka",
    bodyKey: "community.mock.body.osakaReview",
    place: { id: "place-jp-2", nameKey: "place.all.mock.osakaBeauty" },
    rating: 5.0,
    photos: [],
    likes: 19,
    comments: 5,
    views: 198,
  },
  {
    id: "community-mock-5",
    category: "question",
    nickname: "팝업초보",
    minutesAgo: 2880,
    regionKey: "place.filters.regions.kyoto",
    bodyKey: "community.mock.body.kyotoQuestion",
    photos: [],
    likes: 2,
    comments: 7,
    views: 91,
  },
  {
    id: "community-mock-6",
    category: "info",
    nickname: "부산탐험가",
    minutesAgo: 4320,
    regionKey: "place.filters.regions.busan",
    bodyKey: "community.mock.body.busanInfo",
    photos: [banner, poster],
    likes: 11,
    comments: 4,
    views: 143,
  },
];
