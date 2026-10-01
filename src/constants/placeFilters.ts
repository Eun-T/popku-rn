export const placeFilterSections = [
  {
    id: "eventTypes",
    label: "행사 유형",
    labelKey: "place.filters.eventTypes",
  },
  { id: "regions", label: "지역", labelKey: "place.filters.regions" },
  { id: "interests", label: "관심 분야", labelKey: "place.filters.interests" },
  {
    id: "operationStatuses",
    label: "운영 상태",
    labelKey: "place.filters.operationStatuses",
  },
] as const;

export const quickFilters = [
  {
    id: "KR",
    label: "한국",
    labelKey: "place.filters.countries.kr",
    group: "countries",
  },
  {
    id: "JP",
    label: "일본",
    labelKey: "place.filters.countries.jp",
    group: "countries",
  },
  {
    id: "preReservation",
    label: "사전예약",
    labelKey: "place.filters.quick.preReservation",
    group: "quickFeatures",
  },
  {
    id: "benefit",
    label: "혜택",
    labelKey: "place.filters.quick.benefit",
    group: "quickFeatures",
  },
  {
    id: "newOpen",
    label: "신규오픈",
    labelKey: "place.filters.quick.newOpen",
    group: "quickFeatures",
  },
] as const;

export const eventTypeFilters = [
  { id: "popup", label: "팝업", labelKey: "place.filters.eventTypes.popup" },
  {
    id: "exhibition",
    label: "전시",
    labelKey: "place.filters.eventTypes.exhibition",
  },
  {
    id: "performance",
    label: "공연",
    labelKey: "place.filters.eventTypes.performance",
  },
  {
    id: "festival",
    label: "페스티벌",
    labelKey: "place.filters.eventTypes.festival",
  },
  { id: "event", label: "이벤트", labelKey: "place.filters.eventTypes.event" },
] as const;

export const regionFilters = [
  {
    id: "seongsu",
    label: "성수",
    labelKey: "place.filters.regions.seongsu",
    country: "KR",
  },
  {
    id: "hongdae",
    label: "홍대·신촌",
    labelKey: "place.filters.regions.hongdae",
    country: "KR",
  },
  {
    id: "yeouido",
    label: "여의도",
    labelKey: "place.filters.regions.yeouido",
    country: "KR",
  },
  {
    id: "gangnam",
    label: "강남·서초",
    labelKey: "place.filters.regions.gangnam",
    country: "KR",
  },
  {
    id: "jamsil",
    label: "잠실",
    labelKey: "place.filters.regions.jamsil",
    country: "KR",
  },
  {
    id: "busan",
    label: "부산",
    labelKey: "place.filters.regions.busan",
    country: "KR",
  },
  {
    id: "incheon",
    label: "인천",
    labelKey: "place.filters.regions.incheon",
    country: "KR",
  },
  {
    id: "daegu",
    label: "대구",
    labelKey: "place.filters.regions.daegu",
    country: "KR",
  },
  {
    id: "daejeon",
    label: "대전",
    labelKey: "place.filters.regions.daejeon",
    country: "KR",
  },
  {
    id: "gwangju",
    label: "광주",
    labelKey: "place.filters.regions.gwangju",
    country: "KR",
  },
  
{
  id: "suwon",
  label: "수원",
  labelKey: "place.filters.regions.suwon",
  country: "KR",
},
{
  id: "goyang",
  label: "고양",
  labelKey: "place.filters.regions.goyang",
  country: "KR",
},
{
  id: "yongin",
  label: "용인",
  labelKey: "place.filters.regions.yongin",
  country: "KR",
},
{
  id: "ulsan",
  label: "울산",
  labelKey: "place.filters.regions.ulsan",
  country: "KR",
},
{
  id: "changwon",
  label: "창원",
  labelKey: "place.filters.regions.changwon",
  country: "KR",
},
{
  id: "jeonju",
  label: "전주",
  labelKey: "place.filters.regions.jeonju",
  country: "KR",
},

  {
    id: "tokyo",
    label: "도쿄",
    labelKey: "place.filters.regions.tokyo",
    country: "JP",
  },
  {
    id: "osaka",
    label: "오사카",
    labelKey: "place.filters.regions.osaka",
    country: "JP",
  },
  {
    id: "kyoto",
    label: "교토",
    labelKey: "place.filters.regions.kyoto",
    country: "JP",
  },
  {
    id: "fukuoka",
    label: "후쿠오카",
    labelKey: "place.filters.regions.fukuoka",
    country: "JP",
  },
  {
    id: "nagoya",
    label: "나고야",
    labelKey: "place.filters.regions.nagoya",
    country: "JP",
  },
  {
    id: "sapporo",
    label: "삿포로",
    labelKey: "place.filters.regions.sapporo",
    country: "JP",
  },
  {
    id: "yokohama",
    label: "요코하마",
    labelKey: "place.filters.regions.yokohama",
    country: "JP",
  },
] as const;

export const interestFilters = [
  {
    id: "animeCharacter",
    label: "애니·캐릭터",
    labelKey: "place.filters.interests.animeCharacter",
  },
  { id: "game", label: "게임", labelKey: "place.filters.interests.game" },
  { id: "fashion", label: "패션", labelKey: "place.filters.interests.fashion" },
  { id: "beauty", label: "뷰티", labelKey: "place.filters.interests.beauty" },
  {
    id: "foodBeverage",
    label: "F&B",
    labelKey: "place.filters.interests.foodBeverage",
  },
  {
    id: "exhibitionArt",
    label: "전시·아트",
    labelKey: "place.filters.interests.exhibitionArt",
  },
  {
    id: "lifestyle",
    label: "라이프스타일",
    labelKey: "place.filters.interests.lifestyle",
  },
] as const;

export const operationStatusFilters = [
  {
    id: "open",
    label: "운영 중",
    labelKey: "place.filters.operationStatuses.open",
  },
  {
    id: "upcoming",
    label: "오픈 예정",
    labelKey: "place.filters.operationStatuses.upcoming",
  },
  {
    id: "closed",
    label: "종료",
    labelKey: "place.filters.operationStatuses.closed",
  },
] as const;

export type CountryCode = "KR" | "JP";
export type QuickFeatureId = Extract<
  (typeof quickFilters)[number],
  { group: "quickFeatures" }
>["id"];
export type EventTypeId = (typeof eventTypeFilters)[number]["id"];
export type RegionId = (typeof regionFilters)[number]["id"];
export type InterestId = (typeof interestFilters)[number]["id"];
export type OperationStatusId = (typeof operationStatusFilters)[number]["id"];

export type PlaceFilterState = {
  countries: CountryCode[];
  quickFeatures: QuickFeatureId[];
  eventTypes: EventTypeId[];
  regions: RegionId[];
  interests: InterestId[];
  operationStatuses: OperationStatusId[];
};

export const createEmptyPlaceFilters = (): PlaceFilterState => ({
  countries: [],
  quickFeatures: [],
  eventTypes: [],
  regions: [],
  interests: [],
  operationStatuses: [],
});
