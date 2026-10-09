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
      { id: "tokyo", image: require("../../assets/images/regions/tokyo.png") },
      { id: "osaka", image: require("../../assets/images/regions/osaka.png") },
      { id: "kyoto", image: require("../../assets/images/regions/kyoto.png") },
      { id: "nagoya", image: require("../../assets/images/regions/nagoya.png") },
    ],
  },
];
