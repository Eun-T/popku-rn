import { useTranslation } from '../hooks/useTranslation';
import { getTagDisplayName } from '../locales/filterLabels';
import { useMapPopups } from '../hooks/useMapPopups';
import { usePopupNavigation } from '../hooks/usePopupNavigation';
import { MaterialIcons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { uuid } from "expo-modules-core";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, LocateFixed, Search, X } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import {
  Animated,
  Alert,
  Dimensions,
  Easing,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import Reanimated, {
  cancelAnimation,
  Easing as ReanimatedEasing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";
import Supercluster from "supercluster";

import { searchPopups, type PopupMapMarker, type PopupSearchResult } from "../lib/popups";
import { autocompletePlaces, resolvePlace, type PlaceAttribution, type PlaceSuggestion } from "../lib/placeSearch";
import { isPlaceCameraComplete, placeCameraRegion, type SearchRegion } from "../lib/mapPlaceCamera";
import { expandedMarkerPopups, hasValidCoordinates, type MapBounds } from "../lib/mapMarkerBounds";
import { getApiLocale } from "../locales";
import MapPopupListSheet from "../components/map/MapPopupListSheet";
import MapPopupPreviewCard from "../components/map/MapPopupPreviewCard";
import MapSearchOverlay, { GooglePlaceAttribution, type PlaceSearchState, type PopupSearchState } from "../components/map/MapSearchOverlay";
import { colors, typography } from "../theme/tokens";

const initialRegion = {
  latitude: 37.5445,
  longitude: 127.056,
  latitudeDelta: 0.025,
  longitudeDelta: 0.025,
};

const CLUSTERING_LATITUDE_DELTA = 0.20;
const CLUSTER_EXTENT = 512;
// Keep the anchor at y=40 so the title stays fixed in both marker states.
const MARKER_ANCHOR_Y = 40;

type PopupClusterProperties = { popupId: string };
type MapMarkerItem =
  | { type: "popup"; popup: PopupMapMarker }
  | { type: "cluster"; id: number; count: number; latitude: number; longitude: number };

type PendingSearchAction = {
  kind: "popup";
  id: string;
  latitude: number;
  longitude: number;
  moveComplete: boolean;
} | { kind: "place"; region: SearchRegion; moveComplete: boolean };

function boundsForRegion(region: typeof initialRegion): MapBounds {
  return {
    minLat: region.latitude - region.latitudeDelta / 2,
    maxLat: region.latitude + region.latitudeDelta / 2,
    minLng: region.longitude - region.longitudeDelta / 2,
    maxLng: region.longitude + region.longitudeDelta / 2,
  };
}

const GOOGLE_MAP_ID =
  Platform.OS === "ios"
    ? "8874d01a85c7c50d13067f77"
    : "8874d01a85c7c50ddc7033ac";

const tagFilters = [
  "전체",
  "캐릭터/IP",
  "게임/디지털",
  "연예/크리에이터",
  "패션",
  "뷰티",
  "F&B",
  "아트/전시",
  "문구/소품",
  "라이프",
  "패밀리/펫",
  "기타",
] as const;

type MarkerTag = Exclude<(typeof tagFilters)[number], "전체">;

// Display only: preserve existing filter state and marker category strings.
const tagFilterIds: Record<MarkerTag, number> = {
  "캐릭터/IP": 1, "게임/디지털": 2, "연예/크리에이터": 3,
  "패션": 4, "뷰티": 5, "F&B": 6, "아트/전시": 7,
  "문구/소품": 8, "라이프": 9, "패밀리/펫": 10, "기타": 11,
};

type MarkerIconName = ComponentProps<typeof MaterialIcons>["name"];

const markerStyles: Record<
  MarkerTag,
  { backgroundColor: string; iconName: MarkerIconName }
> = {
  "캐릭터/IP": { backgroundColor: "#8B5CF6", iconName: "auto-awesome" },
  "게임/디지털": { backgroundColor: "#2563EB", iconName: "sports-esports" },
  "연예/크리에이터": { backgroundColor: "#DB2777", iconName: "mic" },
  패션: { backgroundColor: "#374151", iconName: "checkroom" },
  뷰티: { backgroundColor: "#FB7185", iconName: "spa" },
  "F&B": { backgroundColor: "#F97316", iconName: "restaurant" },
  "아트/전시": { backgroundColor: "#0D9488", iconName: "palette" },
  "문구/소품": { backgroundColor: "#EAB308", iconName: "shopping-bag" },
  라이프: { backgroundColor: "#84A98C", iconName: "home" },
  "패밀리/펫": { backgroundColor: "#38BDF8", iconName: "pets" },
  기타: { backgroundColor: "#9CA3AF", iconName: "more-horiz" },
};

function markerStyleFor(name: PopupMapMarker["primaryTag"]) {
  return name && Object.prototype.hasOwnProperty.call(markerStyles, name)
    ? markerStyles[name as MarkerTag]
    : markerStyles["기타"];
}

function ClusterMapMarker({
  latitude,
  longitude,
  count,
  onPress,
}: {
  latitude: number;
  longitude: number;
  count: number;
  onPress: () => void;
}) {
  return (
    <Marker
      coordinate={{ latitude, longitude }}
      tracksViewChanges={false}
      stopPropagation
      onPress={onPress}
    >
      <View style={styles.clusterMarker}>
        <Text style={styles.clusterMarkerText}>{count}</Text>
      </View>
    </Marker>
  );
}

export default function MapScreen() {
  const { t, resolvedLanguage } = useTranslation();
  const router = useRouter();
  const openPopup = usePopupNavigation();
  const { popupId } = useLocalSearchParams<{ popupId?: string }>();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const mapRef = useRef<MapView>(null);
  const mapReady = useRef(false);
  const searchInputRef = useRef<TextInput>(null);
  const searchRequestVersion = useRef(0);
  const pendingSearchAction = useRef<PendingSearchAction | null>(null);
  const handledPopupId = useRef<string | null>(null);
  const pendingDetailPopupId = useRef<string | null>(null);
  const searchSessionToken = useRef<string | null>(null);
  const placeResolveController = useRef<AbortController | null>(null);
  const mapMoving = useRef(false);
  const locatingRef = useRef(false);
  const regionChangeVersion = useRef(0);
  const [isLocating, setIsLocating] = useState(false);
  const [showsUserLocation, setShowsUserLocation] = useState(false);
  const [selectedTag, setSelectedTag] =
    useState<(typeof tagFilters)[number]>("전체");
  const { popups, status: mapStatus, refresh: refreshMap } = useMapPopups();
  const [mapBounds, setMapBounds] = useState<MapBounds>(() => boundsForRegion(initialRegion));
  const [mapRegion, setMapRegion] = useState(initialRegion);
  const [mapWidth, setMapWidth] = useState(Dimensions.get("window").width);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [searchState, setSearchState] = useState<PopupSearchState>({ status: "idle", results: [] });
  const [placeSearchState, setPlaceSearchState] = useState<PlaceSearchState>({ status: "idle", results: [] });
  const [resolvingPlaceId, setResolvingPlaceId] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [placeAttributions, setPlaceAttributions] = useState<PlaceAttribution[]>([]);
  const [keyboardTop, setKeyboardTop] = useState<number | null>(null);
  const [searchMoveVersion, setSearchMoveVersion] = useState(0);
  const [selectedPopup, setSelectedPopup] = useState<PopupMapMarker | null>(null);
  const selectedPopupId = selectedPopup?.id;
  const pendingPopupId = pendingSearchAction.current?.kind === "popup"
    ? pendingSearchAction.current.id : undefined;
  const filteredPopups = useMemo(
    () => selectedTag === "전체"
      ? popups
      : popups.filter((popup) => popup.tags?.some((tag) => tag.name === selectedTag)),
    [popups, selectedTag],
  );
  const { clusterIndex, popupsById } = useMemo(() => {
    const validPopups = filteredPopups.filter(hasValidCoordinates);
    const index = new Supercluster<PopupClusterProperties, Record<string, never>>({
      radius: 40,
      maxZoom: 16,
      extent: CLUSTER_EXTENT,
    });
    index.load(validPopups.map((popup) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [popup.longitude, popup.latitude],
      },
      properties: { popupId: popup.id },
    })));
    return {
      clusterIndex: index,
      popupsById: new Map(validPopups.map((popup) => [popup.id, popup])),
    };
  }, [filteredPopups]);
  // Supercluster uses a 512-pixel world tile; derive its zoom from the visible longitude span.
  const clusterZoom = Math.max(0, Math.floor(Math.log2(
    (360 * mapWidth) / (CLUSTER_EXTENT * mapRegion.longitudeDelta),
  )));
  const markerItems = useMemo((): MapMarkerItem[] => {
    if (mapRegion.latitudeDelta < CLUSTERING_LATITUDE_DELTA) {
      return expandedMarkerPopups(filteredPopups, mapBounds, selectedPopupId, pendingPopupId)
        .map((popup) => ({ type: "popup", popup }));
    }

    return clusterIndex.getClusters([
      mapBounds.minLng,
      mapBounds.minLat,
      mapBounds.maxLng,
      mapBounds.maxLat,
    ], clusterZoom).flatMap((feature): MapMarkerItem[] => {
      const [longitude, latitude] = feature.geometry.coordinates;
      if ("cluster" in feature.properties) {
        return [{
          type: "cluster",
          id: feature.properties.cluster_id,
          count: feature.properties.point_count,
          latitude,
          longitude,
        }];
      }
      const popup = popupsById.get(feature.properties.popupId);
      return popup ? [{ type: "popup", popup }] : [];
    });
  }, [clusterIndex, clusterZoom, filteredPopups, mapBounds, mapRegion.latitudeDelta,
    popupsById, selectedPopupId, pendingPopupId, searchMoveVersion]);
  const visiblePopups = useMemo(
    () => filteredPopups.filter((popup) => hasValidCoordinates(popup)
      && popup.latitude >= mapBounds.minLat
      && popup.latitude <= mapBounds.maxLat
      && popup.longitude >= mapBounds.minLng
      && popup.longitude <= mapBounds.maxLng),
    [filteredPopups, mapBounds],
  );
  const [markerHeights, setMarkerHeights] = useState<Record<string, number>>({});
  const [previewPopup, setPreviewPopup] = useState<PopupMapMarker | null>(null);
  const [isListOpen, setIsListOpen] = useState(false);
  const [filterBottom, setFilterBottom] = useState<number | null>(null);
  const [sheetHeight, setSheetHeight] = useState(0);
  const [actionHeight, setActionHeight] = useState(0);
  const [previewHeight, setPreviewHeight] = useState(0);
  const bottomTransition = useRef(new Animated.Value(0)).current;
  const sheetTransition = useSharedValue(0);
  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - sheetTransition.get()) * sheetHeight }],
  }));
  const hasSelectedPopup = selectedPopup !== null && !isListOpen;
  const hasPreviewPopup = previewPopup !== null;
  const bottomInset = Math.max(insets.bottom, 28);
  const previewReady = hasSelectedPopup && hasPreviewPopup
    && actionHeight > 0 && previewHeight > 0;
  const searchCardTop = insets.top + 62;
  const searchCardMaxHeight = Math.max(96, Math.min(360,
    Math.min(windowHeight, keyboardTop ?? windowHeight) - searchCardTop - 12));

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (event) => {
      setKeyboardTop(event.endCoordinates.screenY);
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardTop(null));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!isSearchMode || Array.from(query).length < 2) {
      setSearchState({ status: "idle", results: [] });
      setPlaceSearchState({ status: "idle", results: [] });
      return;
    }

    const version = searchRequestVersion.current;
    const controller = new AbortController();
    const sessionToken = searchSessionToken.current ?? (searchSessionToken.current = uuid.v4());
    setSearchState({ status: "loading", results: [] });
    setPlaceSearchState({ status: "loading", results: [] });
    const timer = setTimeout(() => {
      searchPopups(query, controller.signal)
        .then((results) => {
          if (!controller.signal.aborted && searchRequestVersion.current === version) {
            setSearchState({ status: "success", results });
          }
        })
        .catch(() => {
          if (!controller.signal.aborted && searchRequestVersion.current === version) {
            setSearchState({ status: "error", results: [] });
          }
        });
      autocompletePlaces({ query, languageCode: getApiLocale(), sessionToken }, controller.signal)
        .then((results) => {
          if (!controller.signal.aborted && searchRequestVersion.current === version) {
            setPlaceSearchState({ status: "success", results });
          }
        })
        .catch(() => {
          if (!controller.signal.aborted && searchRequestVersion.current === version) {
            // Disabled, unconfigured and upstream errors affect only the Google section.
            setPlaceSearchState({ status: "hidden", results: [] });
          }
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [isSearchMode, searchQuery]);

  useEffect(() => () => { placeResolveController.current?.abort(); }, []);

  const cancelPlaceResolve = () => {
    const wasResolving = placeResolveController.current !== null;
    placeResolveController.current?.abort();
    placeResolveController.current = null;
    setResolvingPlaceId(null);
    setResolveError(null);
    return wasResolving;
  };

  const closeSearch = () => {
    searchRequestVersion.current += 1;
    cancelPlaceResolve();
    searchSessionToken.current = null;
    setIsSearchMode(false);
    searchInputRef.current?.blur();
    Keyboard.dismiss();
  };

  const changeSearchQuery = (query: string) => {
    searchRequestVersion.current += 1;
    if (cancelPlaceResolve()) searchSessionToken.current = uuid.v4();
    setSearchQuery(query);
  };

  const handleMapInteraction = () => {
    pendingSearchAction.current = null;
    if (isSearchMode) closeSearch();
  };

  const selectSearchPlace = async (suggestion: PlaceSuggestion) => {
    if (placeResolveController.current || !searchSessionToken.current) return;
    const controller = new AbortController();
    placeResolveController.current = controller;
    const version = searchRequestVersion.current;
    const sessionToken = searchSessionToken.current;
    setResolvingPlaceId(suggestion.placeId);
    setResolveError(null);
    try {
      const place = await resolvePlace({ placeId: suggestion.placeId, sessionToken }, controller.signal);
      if (controller.signal.aborted || searchRequestVersion.current !== version) return;
      const region = placeCameraRegion(place);
      if (!region || !mapRef.current) throw new Error("Invalid place location");
      closeSearch();
      setSelectedPopup(null);
      setIsListOpen(false);
      setPlaceAttributions(place.attributions);
      const alreadyAtPlace = !mapMoving.current && isPlaceCameraComplete(mapRegion, region);
      pendingSearchAction.current = { kind: "place", region, moveComplete: alreadyAtPlace };
      if (alreadyAtPlace) {
        setSearchMoveVersion((value) => value + 1);
      } else {
        mapMoving.current = true;
        mapRef.current.animateToRegion(region, 350);
      }
    } catch (error) {
      if (controller.signal.aborted || searchRequestVersion.current !== version) return;
      placeResolveController.current = null;
      setResolvingPlaceId(null);
      if (error instanceof Error && (error.message === "place_search_disabled"
        || error.message === "place_search_not_configured")) {
        setPlaceSearchState({ status: "hidden", results: [] });
      } else {
        setResolveError("위치를 불러올 수 없어요. 다시 선택해 주세요.");
      }
    }
  };

  const moveToPopup = async (popupId: string, clearQuery: boolean, showError: boolean) => {
    closeSearch();
    // A new command supersedes an older camera completion even while awaiting data.
    pendingSearchAction.current = null;
    if (clearQuery) setSearchQuery("");
    const version = searchRequestVersion.current;
    setIsListOpen(false);
    setSelectedPopup(null);

    let popup = popups.find((item) => item.id === popupId);
    if (!popup) {
      try {
        const refreshed = await refreshMap();
        if (searchRequestVersion.current !== version) return;
        popup = refreshed.find((item) => item.id === popupId);
      } catch {
        if (searchRequestVersion.current !== version) return;
        if (showError) Alert.alert(t("map.popupLoadFailed"), t("place.detail.tryLater"));
        return;
      }
    }
    if (!popup || !hasValidCoordinates(popup) || !mapRef.current) {
      if (showError) Alert.alert(t("map.popupMissing"), t("map.refreshAndRetry"));
      return;
    }

    if (selectedTag !== "전체" && !popup.tags?.some((tag) => tag.name === selectedTag)) {
      setSelectedTag("전체");
    }

    const alreadyAtPopup = !mapMoving.current && Math.abs(mapRegion.latitude - popup.latitude) < 0.001
      && Math.abs(mapRegion.longitude - popup.longitude) < 0.001
      && mapRegion.latitudeDelta <= initialRegion.latitudeDelta * 1.2;
    pendingSearchAction.current = {
      kind: "popup",
      id: popup.id,
      latitude: popup.latitude,
      longitude: popup.longitude,
      moveComplete: alreadyAtPopup,
    };
    if (alreadyAtPopup) {
      setSearchMoveVersion((version) => version + 1);
    } else {
      mapMoving.current = true;
      mapRef.current.animateToRegion({
        latitude: popup.latitude,
        longitude: popup.longitude,
        latitudeDelta: initialRegion.latitudeDelta,
        longitudeDelta: initialRegion.longitudeDelta,
      }, 350);
    }
  };

  const selectSearchPopup = (result: PopupSearchResult) => {
    void moveToPopup(result.id, true, true);
  };

  useEffect(() => {
    const id = typeof popupId === "string" ? popupId.trim() : "";
    if (!id) {
      handledPopupId.current = null;
      return;
    }
    if (handledPopupId.current === id) return;
    handledPopupId.current = id;
    router.setParams({ popupId: undefined });
    if (mapReady.current) {
      void moveToPopup(id, false, false);
    } else {
      pendingDetailPopupId.current = id;
    }
  }, [popupId]);

  useEffect(() => {
    const pending = pendingSearchAction.current;
    if (!pending?.moveComplete) return;
    if (pending.kind === "place") {
      // This effect runs after the completed region has recomputed visiblePopups.
      pendingSearchAction.current = null;
      setIsListOpen(true);
      return;
    }
    const marker = markerItems.find((item) => item.type === "popup" && item.popup.id === pending.id);
    if (!marker || marker.type !== "popup") return;
    pendingSearchAction.current = null;
    setSelectedPopup(marker.popup);
  }, [markerItems, searchMoveVersion, visiblePopups]);

  useEffect(() => {
    let active = true;
    Location.getForegroundPermissionsAsync()
      .then(({ granted }) => {
        if (active) setShowsUserLocation(granted);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const moveToCurrentLocation = async () => {
    if (locatingRef.current) return;
    locatingRef.current = true;
    setIsLocating(true);
    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (!permission.granted && permission.canAskAgain) {
        permission = await Location.requestForegroundPermissionsAsync();
      }
      if (!permission.granted) {
        setShowsUserLocation(false);
        Alert.alert(t("map.locationPermissionTitle"), t("map.locationPermissionDescription"));
        return;
      }

      setShowsUserLocation(true);
      const { coords } = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      mapRef.current?.animateToRegion({
        latitude: coords.latitude,
        longitude: coords.longitude,
        latitudeDelta: initialRegion.latitudeDelta,
        longitudeDelta: initialRegion.longitudeDelta,
      }, 350);
    } catch {
      Alert.alert(t("map.locationFailed"), t("map.checkLocationService"));
    } finally {
      locatingRef.current = false;
      setIsLocating(false);
    }
  };

  useEffect(() => {
    if (selectedPopup && !isListOpen) setPreviewPopup(selectedPopup);
  }, [selectedPopup, isListOpen]);

  useEffect(() => {
    if (sheetHeight === 0) return;
    sheetTransition.set(withTiming(isListOpen ? 1 : 0, {
      duration: 400,
      easing: ReanimatedEasing.out(ReanimatedEasing.cubic),
    }));
    return () => cancelAnimation(sheetTransition);
  }, [isListOpen, sheetHeight, sheetTransition]);

  useEffect(() => {
    if (selectedPopup) {
      const current = popupsById.get(selectedPopup.id) ?? null;
      if (current !== selectedPopup) setSelectedPopup(current);
    }
  }, [popupsById, selectedPopup]);

  useEffect(() => {
    if (selectedPopup && !markerItems.some((item) =>
      item.type === "popup" && item.popup.id === selectedPopup.id)) {
      setSelectedPopup(null);
    }
  }, [markerItems, selectedPopup]);

  useEffect(() => {
    if (!hasSelectedPopup && !hasPreviewPopup) return;
    if (hasSelectedPopup && !previewReady) return;
    Animated.timing(bottomTransition, {
      toValue: hasSelectedPopup ? 1 : 0,
      duration: 230,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !hasSelectedPopup) {
        setPreviewPopup(null);
        setPreviewHeight(0);
      }
    });
    return () => bottomTransition.stopAnimation();
  }, [bottomTransition, hasSelectedPopup, hasPreviewPopup, previewReady]);

  const actionTranslateY = bottomTransition.interpolate({
    inputRange: [0, 1],
    outputRange: [0, actionHeight + 12],
  });
  const previewTranslateY = bottomTransition.interpolate({
    inputRange: [0, 1],
    outputRange: [previewHeight + 12, 0],
  });



  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        onLayout={(event) => {
          const width = event.nativeEvent.layout.width;
          if (width > 0) setMapWidth(width);
        }}
        provider={PROVIDER_GOOGLE}
        googleMapId={GOOGLE_MAP_ID}
        initialRegion={initialRegion}
        showsUserLocation={showsUserLocation}
        showsMyLocationButton={false}
        scrollEnabled
        zoomEnabled
        onMapReady={() => {
          mapReady.current = true;
          const requestVersion = regionChangeVersion.current;
          mapRef.current?.getMapBoundaries()
            .then(({ northEast, southWest }) => {
              if (regionChangeVersion.current !== requestVersion) return;
              setMapBounds({
                minLat: southWest.latitude,
                maxLat: northEast.latitude,
                minLng: southWest.longitude,
                maxLng: northEast.longitude,
              });
            })
            .catch(() => {
              if (regionChangeVersion.current === requestVersion) {
                setMapBounds(boundsForRegion(initialRegion));
              }
            });
          const detailPopupId = pendingDetailPopupId.current;
          pendingDetailPopupId.current = null;
          if (detailPopupId) void moveToPopup(detailPopupId, false, false);
        }}
        onPress={(event) => {
          if (event.nativeEvent.action === "press" || event.nativeEvent.action === undefined) {
            handleMapInteraction();
            setSelectedPopup(null);
          }
        }}
        onPanDrag={handleMapInteraction}
        onRegionChange={(_region, details) => {
          mapMoving.current = true;
          if (details?.isGesture) handleMapInteraction();
        }}
        onRegionChangeComplete={(region, details) => {
          mapMoving.current = false;
          const bounds = boundsForRegion(region);
          regionChangeVersion.current += 1;
          // Keep equal snapshots stable without skipping pending completion or
          // the version increment that protects the initial native bounds read.
          setMapRegion((current) => current.latitude === region.latitude
            && current.longitude === region.longitude
            && current.latitudeDelta === region.latitudeDelta
            && current.longitudeDelta === region.longitudeDelta ? current : region);
          setMapBounds((current) => current.minLat === bounds.minLat
            && current.maxLat === bounds.maxLat
            && current.minLng === bounds.minLng
            && current.maxLng === bounds.maxLng ? current : bounds);
          console.log("Map bounds:", bounds);
          const pending = pendingSearchAction.current;
          if (pending && details?.isGesture) {
            pendingSearchAction.current = null;
          } else if (pending?.kind === "place" && isPlaceCameraComplete(region, pending.region)) {
            pending.moveComplete = true;
            setSearchMoveVersion((version) => version + 1);
          } else if (pending?.kind === "popup"
            && Math.abs(region.latitude - pending.latitude) < 0.005
            && Math.abs(region.longitude - pending.longitude) < 0.005
            && region.latitudeDelta < CLUSTERING_LATITUDE_DELTA) {
            pending.moveComplete = true;
            setSearchMoveVersion((version) => version + 1);
          }
        }}
      >
        {markerItems.map((item) => {
          if (item.type === "cluster") {
            return (
              <ClusterMapMarker
                key={`cluster-${selectedTag}-${item.id}-${item.count}`}
                latitude={item.latitude}
                longitude={item.longitude}
                count={item.count}
                onPress={() => {
                  setSelectedPopup(null);
                  const expansionZoom = clusterIndex.getClusterExpansionZoom(item.id);
                  const targetZoom = Math.min(expansionZoom, clusterZoom + 2);
                  const longitudeDelta = (360 * mapWidth) / (CLUSTER_EXTENT * 2 ** targetZoom);
                  mapRef.current?.animateToRegion({
                    latitude: item.latitude,
                    longitude: item.longitude,
                    latitudeDelta: mapRegion.latitudeDelta * longitudeDelta / mapRegion.longitudeDelta,
                    longitudeDelta,
                  }, 350);
                }}
              />
            );
          }
          const popup = item.popup;
          const { backgroundColor, iconName } = markerStyleFor(popup.primaryTag);
          const isSelected = selectedPopup?.id === popup.id;
          const markerKey = `${popup.id}-${isSelected}`;
          const markerHeight = markerHeights[markerKey];
          return (
            <Marker
              key={`${popup.id}-${isSelected}`}
              coordinate={{
                latitude: popup.latitude,
                longitude: popup.longitude,
              }}
              anchor={{
                x: 0.5,
                y: markerHeight ? MARKER_ANCHOR_Y / markerHeight : 0.5,
              }}
              tracksViewChanges={false}
              zIndex={isSelected ? 1 : 0}
              onPress={() => setSelectedPopup(popup)}
            >
              <View
                style={styles.markerContent}
                onLayout={(event) => {
                  const height = event.nativeEvent.layout.height;
                  if (height > 0) {
                    setMarkerHeights((current) => current[markerKey] === height
                      ? current
                      : { ...current, [markerKey]: height });
                  }
                }}
              >
                <View style={[styles.markerGraphicSlot, !isSelected && styles.markerGraphicBottom]}>
                  {isSelected ? (
                    <View style={styles.selectedPin}>
                      <Svg width={34} height={38} viewBox="0 0 48 52">
                        <Path
                          d="M24 2 C12 2 4 10 4 21 C4 32 12 38 24 50 C36 38 44 32 44 21 C44 10 36 2 24 2 Z"
                          fill={backgroundColor}
                        />
                        <Circle cx={24} cy={21} r={15} fill="#FFFFFF" />
                      </Svg>
                      <View style={styles.selectedPinIcon}>
                        <MaterialIcons name={iconName} size={14} color={backgroundColor} />
                      </View>
                    </View>
                  ) : (
                    <View style={styles.markerWrapper}>
                      <View style={[styles.marker, { backgroundColor }]}>
                        <MaterialIcons name={iconName} size={12} color="#FFFFFF" />
                      </View>
                    </View>
                  )}
                </View>
                <Text
                  style={styles.markerTitle}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {popup.name}
                </Text>
              </View>
            </Marker>
          );
        })}
      </MapView>
      {filterBottom !== null && (
        <Reanimated.View
          pointerEvents={isListOpen && sheetHeight > 0 ? "auto" : "none"}
          onLayout={(event) => setSheetHeight(event.nativeEvent.layout.height)}
          style={[
            styles.listSheet,
            {
              opacity: sheetHeight > 0 ? 1 : 0,
            },
            sheetAnimatedStyle,
          ]}
        >
          <View style={[styles.listSheetContent, { top: filterBottom }]}>
            <MapPopupListSheet
              status={mapStatus}
              onRetry={() => { void refreshMap().catch(() => {}); }}
              popups={visiblePopups}
              bottomPadding={actionHeight}
              onPopupPress={(id) => openPopup(id)}
            />
          </View>
        </Reanimated.View>
      )}
      {isSearchMode && (
        <View pointerEvents="box-none" style={styles.searchOverlay}>
          {Array.from(searchQuery.trim()).length >= 2 && (
            <View style={[styles.searchResultsCard, {
              top: searchCardTop,
              maxHeight: searchCardMaxHeight,
            }]}>
              <MapSearchOverlay
                query={searchQuery}
                search={searchState}
                places={placeSearchState}
                resolvingPlaceId={resolvingPlaceId}
                resolveError={resolveError}
                maxHeight={searchCardMaxHeight}
                onSelect={selectSearchPopup}
                onSelectPlace={selectSearchPlace}
              />
            </View>
          )}
        </View>
      )}
      {placeAttributions.length > 0 && !isSearchMode && !isListOpen && !selectedPopup && (
        <View style={[styles.placeAttributions, { bottom: actionHeight + 8 }]}>
          <GooglePlaceAttribution providers={placeAttributions} />
        </View>
      )}
      <View style={[styles.searchBar, { top: insets.top + 12 }, isSearchMode && styles.searchBarActive]}>
        <Search size={20} color={colors.secondaryText} />
        <TextInput
          ref={searchInputRef}
          style={styles.searchInput}
          value={searchQuery}
          onFocus={() => {
            pendingSearchAction.current = null;
            if (!isSearchMode) {
              searchRequestVersion.current += 1;
              searchSessionToken.current = uuid.v4();
              setResolveError(null);
            }
            setIsSearchMode(true);
          }}
          onChangeText={changeSearchQuery}
          placeholder={t("map.search.placeholder")}
          placeholderTextColor={colors.secondaryText}
          returnKeyType="search"
          underlineColorAndroid="transparent"
        />
        {searchQuery.length > 0 && (
          <Pressable accessibilityRole="button" accessibilityLabel={t("place.all.clearSearch")} hitSlop={8} onPress={() => changeSearchQuery("")}>
            <X size={18} color={colors.secondaryText} />
          </Pressable>
        )}
        {isSearchMode && (
          <Pressable accessibilityRole="button" onPress={closeSearch} style={styles.searchCancelButton}>
            <Text style={styles.searchCancel}>{t("community.cancel")}</Text>
          </Pressable>
        )}
        <View pointerEvents="none" style={[styles.tagFilterBorder, { borderColor: colors.border }]} />
      </View>
      <ScrollView
        horizontal
        onLayout={(event) => {
          const { y, height } = event.nativeEvent.layout;
          setFilterBottom(y + height);
        }}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        style={[styles.tagFilters, { top: insets.top + 12 + 44 + 8 }]}
        contentContainerStyle={styles.tagFiltersContent}
      >
        {tagFilters.map((tag) => {
          const isSelected = selectedTag === tag;

          return (
            <Pressable
              key={tag}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              onPress={() => setSelectedTag(tag)}
              style={[
                styles.tagFilter,
                isSelected ? styles.tagFilterSelected : styles.tagFilterDefault,
              ]}
            >
              <Text
                style={[
                  styles.tagFilterText,
                  isSelected && styles.tagFilterTextSelected,
                ]}
                numberOfLines={1}
              >
                {tag === "전체" ? t("community.category.all") : getTagDisplayName({ id: tagFilterIds[tag], name: tag }, resolvedLanguage)}
              </Text>
              <View
                pointerEvents="none"
                style={[styles.tagFilterBorder, { borderColor: isSelected ? colors.text : colors.border }]}
              />
            </Pressable>
          );
        })}
      </ScrollView>
      {actionHeight > 0 && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("map.currentLocation")}
          accessibilityState={{ disabled: isLocating }}
          disabled={isLocating}
          onPress={moveToCurrentLocation}
          style={[styles.locationButton, { bottom: actionHeight + 12 }]}
        >
          <LocateFixed size={22} color={colors.text} />
        </Pressable>
      )}
      <Animated.View
        pointerEvents={hasSelectedPopup ? "none" : "auto"}
        onLayout={(event) => setActionHeight(event.nativeEvent.layout.height)}
        style={[
          styles.mapActions,
          { paddingBottom: bottomInset, transform: [{ translateY: actionTranslateY }] },
        ]}
      >
        <View style={styles.mapActionButtons}>
          <Pressable
            accessibilityRole="button"
            style={styles.backButton}
            onPress={() => router.replace("/")}
          >
            <ArrowLeft size={22} color={colors.text} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={styles.viewPopupsButton}
            onPress={() => setIsListOpen((open) => !open)}
          >
            <Text style={styles.viewPopupsButtonText}>
              {isListOpen ? t("map.returnToMap") : t("map.viewPopups", { count: visiblePopups.length })}
            </Text>
          </Pressable>
        </View>
      </Animated.View>
      {previewPopup && (
        <Animated.View
          pointerEvents={hasSelectedPopup ? "auto" : "none"}
          onLayout={(event) => setPreviewHeight(event.nativeEvent.layout.height)}
          style={[
            styles.previewOverlay,
            {
              opacity: !isListOpen && previewHeight > 0 ? 1 : 0,
              transform: [{ translateY: previewTranslateY }],
            },
          ]}
        >
          <MapPopupPreviewCard
            popup={previewPopup}
            bottomInset={bottomInset}
            onPress={() => openPopup(previewPopup.id)}
          />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  placeAttributions: {
    position: "absolute",
    left: 20,
    right: 76,
    zIndex: 4,
    backgroundColor: colors.background,
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
    width: "100%",
  },
  listSheet: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
    zIndex: 2,
    elevation: 4,
  },
  listSheetContent: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  markerContent: {
    alignItems: "center",
  },
  markerGraphicSlot: {
    height: 52,
    alignItems: "center",
  },
  markerGraphicBottom: {
    justifyContent: "flex-end",
  },
  clusterMarker: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.background,
    borderColor: colors.primary,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  clusterMarkerText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  markerWrapper: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",

    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.18,
    shadowRadius: 2,

    elevation: 2,
  },
  marker: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  selectedPin: {
    width: 34,
    height: 38,
    marginTop: 13,
  },
  selectedPinIcon: {
    position: "absolute",
    left: 6,
    top: 4.5,
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  markerTitle: {
    maxWidth: 80,
    marginTop: 3,
    fontSize: 11,
    fontWeight: "600",
    color: "#111827",
    textAlign: "center",
    textShadowColor: "rgba(255, 255, 255, 0.9)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 2,
  },
  searchBar: {
    position: "absolute",
    zIndex: 2,
    left: 20,
    right: 20,
    height: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 15,
    borderRadius: 999,
    backgroundColor: colors.background,
    // shadowColor: "#000",
    // shadowOffset: { width: 0, height: 2 },
    // shadowOpacity: 0.2,
    // shadowRadius: 8,
    // elevation: 3,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 0,
    ...typography.label,
    fontSize: 15,
    color: colors.text,
  },
  tagFilters: {
    position: "absolute",
    zIndex: 2,
    left: 0,
    right: 0,
    height: 36,
  },
  tagFiltersContent: {
    columnGap: 8,
    paddingHorizontal: 20,
  },
  tagFilter: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    // shadowColor: "#000",
    // shadowOffset: { width: 0, height: 2 },
    // shadowOpacity: 0.2,
    // shadowRadius: 8,
    // elevation: 3,
  },
  tagFilterDefault: {
    backgroundColor: colors.background,
  },
  tagFilterSelected: {
    backgroundColor: colors.text,
  },
  tagFilterBorder: {
    ...StyleSheet.absoluteFill,
    borderRadius: 999,
    borderWidth: 1,
  },
  tagFilterText: {
    ...typography.label,
    color: colors.text,
  },
  tagFilterTextSelected: {
    color: colors.background,
  },
  searchBarActive: {
    zIndex: 6,
    elevation: 8,
  },
  searchOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 5,
    elevation: 7,
  },
  searchResultsCard: {
    position: "absolute",
    left: 20,
    right: 20,
    backgroundColor: colors.background,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  searchCancel: {
    ...typography.label,
    color: colors.text,
  },
  searchCancelButton: {
    minWidth: 44,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  locationButton: {
    position: "absolute",
    zIndex: 1,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  mapActions: {
    position: "absolute",
    zIndex: 3,
    elevation: 5,
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: colors.background,
    overflow: "hidden",
  },
  mapActionButtons: {
    flexDirection: "row",
    gap: 8,
  },
  previewOverlay: {
    position: "absolute",
    zIndex: 4,
    left: 0,
    right: 0,
    bottom: 0,
  },
  backButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.background,
    // borderWidth: 1,
    // borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  viewPopupsButton: {
    flex: 1,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#22C55E",
    alignItems: "center",
    justifyContent: "center",
  },
  viewPopupsButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
});
