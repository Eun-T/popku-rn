import type { ImageSourcePropType } from "react-native";

import type { RegionId } from "./placeFilters";

export type PlaceRegionCardItem = {
  id: RegionId;
  image: ImageSourcePropType;
};

export type PlaceRegionPage = {
  id: "KR" | "JP";
  descriptionKey: string;
  items: readonly PlaceRegionCardItem[];
};

const placeholderImage = require("../../assets/images/ranking-placeholder.png");
const bannerImage = require("../../assets/images/banner_01.jpg");

export const placeRegionSectionTitleKey = "place.explore.regions";

export const placeRegionPages: readonly PlaceRegionPage[] = [
  {
    id: "KR",
    descriptionKey: "place.explore.koreanRegionsDescription",
    items: [
      {
        id: "seongsu",
        image: require("../../assets/images/regions/seongsu.png"),
      },
      {
        id: "hongdae",
        image: require("../../assets/images/regions/hongdae.png"),
      },
      {
        id: "yeouido",
        image: require("../../assets/images/regions/yeouido.png"),
      },
      {
        id: "gangnam",
        image: require("../../assets/images/regions/gangnam.png"),
      },
    ],
  },
  {
    id: "JP",
    descriptionKey: "place.explore.japaneseRegionsDescription",
    items: [
      { id: "tokyo", image: placeholderImage },
      { id: "osaka", image: bannerImage },
      { id: "kyoto", image: placeholderImage },
      { id: "fukuoka", image: bannerImage },
    ],
  },
];
