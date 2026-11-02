import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Heart,
  MapPin,
  Share2,
  Ticket,
} from "lucide-react-native";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useTranslation } from "../../hooks/useTranslation";
import {
  getPopupRegionDisplayName,
  getTagDisplayName,
} from "../../locales/filterLabels";

import Constants from "expo-constants";
import {
  FLOATING_TAB_BAR_BOTTOM_GAP,
  FLOATING_TAB_BAR_HEIGHT,
} from "../../components/navigation/FloatingTabBar";
import DirectionsSheet from "../../components/place/DirectionsSheet";
import IntroductionImageCarousel from "../../components/place/IntroductionImageCarousel";
import OfficialChannelIcon from "../../components/place/OfficialChannelIcon";
import PlaceMapPreview, {
  isMapPreviewAvailable,
} from "../../components/place/PlaceMapPreview";
import PopupDetailSkeleton from "../../components/place/PopupDetailSkeleton";
import PopupHeroImage from "../../components/place/PopupHeroImage";
import PopupIntroduction from "../../components/place/PopupIntroduction";
import PopupBlogReviews, { type BlogReviewsHandle } from "../../components/place/PopupBlogReviews";
import PopupNearbySection, { type NearbySectionHandle } from "../../components/place/PopupNearbySection";
import PopupSimilarSection, { type SimilarSectionHandle } from "../../components/place/PopupSimilarSection";
import PopupReviews from "../../components/place/PopupReviews";
import type { RecoverHomeCover } from "../../hooks/useHomeCoverImage";
import {
  clearTokens,
  getAuthSession,
  getAuthUser,
  subscribeAuthUser,
} from "../../lib/auth";
import {
  mergeExploreCovers,
  recoverExploreCover,
} from "../../lib/exploreCoverRecovery";
import {
  favoritePopup,
  FavoriteUnauthorizedError,
  unfavoritePopup,
} from "../../lib/favorites";
import {
  buildMapLinks,
  openMapLinks,
  type MapService,
} from "../../lib/mapDirections";
import { mergeRecoveredCover } from "../../lib/placeCoverRecovery";
import {
  isValidExternalUrl,
  officialChannelLabel,
  officialChannelLinks,
  popupIntroductionSections,
} from "../../lib/popupDetailContent";
import {
  getPopupDetail,
  PopupDetailUnauthorizedError,
  type PublicPopup,
  type PublicPopupDetail,
} from "../../lib/popups";
import { subscribeReviews } from "../../lib/reviews";
import type { Locale } from "../../locales";
import { colors, radius, spacing, typography } from "../../theme/tokens";

// Temporarily hide the location preview; keep directions available.
const SHOW_LOCATION_MAP = false;

type DetailRowProps = {
  icon: ReactNode;
  label: string;
  children: ReactNode;
  alignTop?: boolean;
  compact?: boolean;
  webFact?: boolean;
};
type DetailWithCover = PublicPopupDetail &
  Pick<PublicPopup, "coverImageFetchedAt"> & { contentImageFetchedAt?: number };
type DetailState = {
  id: string | undefined;
  languageCode: Locale;
  status: "loading" | "ready" | "error";
  detail: DetailWithCover | null;
};

function DetailRow({
  icon,
  label,
  children,
  alignTop = false,
  compact = false,
  webFact = false,
}: DetailRowProps) {
  return (
    <View style={[styles.infoRow, alignTop && styles.infoRowTop]}>
      <View
        style={[
          styles.rowIcon,
          alignTop && styles.rowIconTop,
          webFact && styles.factIcon,
        ]}
      >
        {icon}
      </View>
      <Text
        style={[
          styles.rowLabel,
          compact && styles.reservationLabel,
          webFact && styles.factLabel,
        ]}
      >
        {label}
      </Text>
      <View style={[styles.rowValue, webFact && styles.factValue]}>
        {children}
      </View>
    </View>
  );
}

function detailDayStatus(
  item: PublicPopupDetail,
  today: string,
  language: string,
) {
  const { startDate: start, endDate: end } = item;
  const ja = language === "ja";
  const daysUntil = (date: string) =>
    (Date.parse(date + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) /
    86_400_000;
  if (end && end < today)
    return { label: ja ? "終了" : "종료", color: "#9CA3AF" };
  if (start && start > today)
    return {
      label: (ja ? "オープン" : "오픈") + " D-" + daysUntil(start),
      color: "#2563EB",
    };
  if (end === today)
    return { label: ja ? "本日終了" : "오늘 종료", color: "#C05621" };
  if (start === today)
    return { label: ja ? "本日オープン" : "오늘 오픈", color: "#16805D" };
  if (start && start < today && end && end > today)
    return {
      label: (ja ? "終了" : "종료") + " D-" + daysUntil(end),
      color: "#16805D",
    };
  return null;
}

function formatDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${year}.${month}.${day}`;
}

// Recovery reads only cover identity; nullable detail dates are not filter inputs.
function heroPopup(detail: DetailWithCover): PublicPopup {
  return {
    ...detail,
    startDate: detail.startDate ?? "",
    endDate: detail.endDate ?? "",
  };
}

function formatPopupDetailPeriod(start: string | null, end: string | null): string {
  const format = (date: string, withYear: boolean) => {
    const [year, month, day] = date.split("-");
    return `${withYear ? `${year.slice(-2)}년 ` : ""}${Number(month)}월 ${Number(day)}일`;
  };
  if (start && end)
    return `${format(start, true)} - ${format(end, start.slice(0, 4) !== end.slice(0, 4))}`;
  if (start) return format(start, true);
  if (end) return format(end, true);
  return "";
}

function formatDateTime(value: string): string {
  const [date, time] = value.split("T");
  return `${formatDate(date)} ${time?.slice(0, 5) ?? ""}`.trim();
}

export default function PlaceDetail() {
  const { t, resolvedLanguage } = useTranslation();
  const { id, tab } = useLocalSearchParams<{ id: string; tab?: string }>();
  const router = useRouter();
  const languageCode = resolvedLanguage;
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const blogReviewsRef = useRef<BlogReviewsHandle>(null);
  const nearbySectionRef = useRef<NearbySectionHandle>(null);
  const similarSectionRef = useRef<SimilarSectionHandle>(null);
  const authUser = useSyncExternalStore(
    subscribeAuthUser,
    getAuthUser,
    getAuthUser,
  );
  const [isFavoriteUpdating, setFavoriteUpdating] = useState(false);
  const favoriteBusy = useRef(false);
  const favoriteGeneration = useRef(0);
  const refreshReviews = useRef<(() => void) | null>(null);
  const [reviewsVisible, setReviewsVisible] = useState(tab === "reviews");
  const reviewsY = useRef<number | null>(null);
  const pendingReviewScroll = useRef(tab === "reviews");
  const [directionsVisible, setDirectionsVisible] = useState(false);
  const [officialChannelsVisible, setOfficialChannelsVisible] = useState(false);
  const directionsTranslation = useRef(t);
  useEffect(() => {
    directionsTranslation.current = t;
  }, [t]);
  const [requestState, setRequestState] = useState<DetailState>({
    id,
    languageCode,
    status: "loading",
    detail: null,
  });
  const coverScope = JSON.stringify([
    id,
    languageCode,
    requestState.detail?.countryCode,
  ]);
  const latestCoverScope = useRef(coverScope);
  latestCoverScope.current = coverScope;
  const coverMounted = useRef(false);
  useEffect(() => {
    coverMounted.current = true;
    return () => {
      coverMounted.current = false;
    };
  }, []);
  const recoverHeroCover: RecoverHomeCover = async (original, manual) => {
    const generation = favoriteGeneration.current;
    if (
      !coverMounted.current ||
      latestCoverScope.current !== coverScope ||
      (original.countryCode !== "KR" && original.countryCode !== "JP")
    )
      return null;
    const result = await recoverExploreCover(
      original,
      original.countryCode,
      languageCode,
      manual,
    );
    if (
      !coverMounted.current ||
      latestCoverScope.current !== coverScope ||
      favoriteGeneration.current !== generation ||
      !result
    )
      return null;
    setRequestState((current) => {
      if (
        current.id !== id ||
        current.languageCode !== languageCode ||
        !current.detail
      )
        return current;
      const popup = heroPopup(current.detail);
      const [cover] = mergeRecoveredCover(
        [popup],
        original,
        result.detail,
        result.fetchedAt,
      );
      return cover === popup
        ? current
        : {
            ...current,
            detail: {
              ...current.detail,
              coverImageUrl: cover.coverImageUrl,
              coverImageCacheKey: cover.coverImageCacheKey,
              coverImageFetchedAt: cover.coverImageFetchedAt,
            },
          };
    });
    return result;
  };

  useEffect(() => {
    setReviewsVisible(tab === "reviews");
    reviewsY.current = null;
    pendingReviewScroll.current = tab === "reviews";
  }, [id, tab]);

  useEffect(() => {
    favoriteGeneration.current += 1;
    if (!id) {
      setRequestState({ id, languageCode, status: "error", detail: null });
      return;
    }
    let active = true;
    let request: AbortController | null = null;
    let version = 0;
    let summaryOnly = false;
    let dirty = false;
    let queued = false;
    setRequestState({ id, languageCode, status: "loading", detail: null });
    function schedule() {
      if (!active || !dirty || queued || request) return;
      queued = true;
      void Promise.resolve().then(() => {
        queued = false;
        if (active && dirty && !request) load();
      });
    }
    function load() {
      const controller = new AbortController();
      const fetchedAt = Date.now();
      const readVersion = version;
      request = controller;
      dirty = false;
      void getAuthSession()
        .then(async ({ accessToken: token, generation }) => {
          if (controller.signal.aborted)
            throw new Error("Popup detail read aborted");
          if (__DEV__)
            console.info("[FAVORITE] detail request", {
              publicId: id,
              tokenPresent: !!token,
            });
          try {
            return await getPopupDetail(
              id,
              controller.signal,
              token ?? undefined,
              languageCode,
              generation,
            );
          } catch (error) {
            if (
              token &&
              error instanceof PopupDetailUnauthorizedError &&
              !error.requestRetried &&
              !controller.signal.aborted
            ) {
              if ((await clearTokens(generation)) === false) throw error;
              return getPopupDetail(
                id,
                controller.signal,
                undefined,
                languageCode,
              );
            }
            throw error;
          }
        })
        .then((detail) => {
          if (active && !controller.signal.aborted && readVersion === version) {
            if (summaryOnly) {
              if (
                typeof detail.reviewCount !== "number" ||
                !Number.isSafeInteger(detail.reviewCount) ||
                detail.reviewCount < 0 ||
                typeof detail.averageRating !== "number" ||
                !Number.isFinite(detail.averageRating) ||
                detail.averageRating < 0 ||
                detail.averageRating > 5
              ) {
                throw new Error("Invalid popup review summary");
              }
              // The public detail GET is authoritative for aggregates only. A review
              // refresh must not overwrite a favorite mutation made during this GET.
              setRequestState((current) =>
                current.id === id &&
                current.languageCode === languageCode &&
                current.detail
                  ? {
                      ...current,
                      detail: {
                        ...current.detail,
                        reviewCount: detail.reviewCount,
                        averageRating: detail.averageRating,
                      },
                    }
                  : current,
              );
              return;
            }
            if (__DEV__)
              console.info("[FAVORITE] detail loaded", {
                publicId: id,
                favoriteCount: detail.favoriteCount,
                isFavorited: detail.isFavorited,
              });
            const [cover] = mergeExploreCovers(
              [heroPopup(detail)],
              detail.countryCode,
              languageCode,
              fetchedAt,
            );
            setRequestState({
              id,
              languageCode,
              status: "ready",
              detail: {
                ...detail,
                contentImageFetchedAt: fetchedAt,
                coverImageUrl: cover.coverImageUrl,
                coverImageCacheKey: cover.coverImageCacheKey,
                coverImageFetchedAt: cover.coverImageFetchedAt,
              },
            });
            summaryOnly = true;
          }
        })
        .catch(() => {
          if (active && !controller.signal.aborted && readVersion === version) {
            if (summaryOnly) dirty = true;
            else
              setRequestState({
                id,
                languageCode,
                status: "error",
                detail: null,
              });
          }
        })
        .finally(() => {
          if (request !== controller) return;
          request = null;
        });
    }
    const unsubscribe = subscribeReviews((changed) => {
      if (changed !== id) return;
      version += 1;
      dirty = true;
      request?.abort();
      request = null;
      schedule();
    });
    refreshReviews.current = schedule;
    load();
    return () => {
      active = false;
      request?.abort();
      unsubscribe();
      refreshReviews.current = null;
    };
  }, [id, authUser, languageCode]);

  useFocusEffect(
    useCallback(() => {
      const entry = StatusBar.pushStackEntry({ barStyle: "dark-content" });
      return () => StatusBar.popStackEntry(entry);
    }, []),
  );

  useFocusEffect(
    useCallback(() => {
      refreshReviews.current?.();
    }, [id, authUser, languageCode]),
  );

  const topSafeAreaBackground = (
    <View
      pointerEvents="none"
      accessible={false}
      style={[styles.topSafeAreaBackground, { height: insets.top }]}
    />
  );

  const detail =
    requestState.id === id &&
    requestState.languageCode === languageCode &&
    requestState.status === "ready"
      ? requestState.detail
      : null;

  const toggleFavorite = async () => {
    if (__DEV__)
      console.info("[FAVORITE] heart press", {
        publicId: detail?.publicId,
        busy: favoriteBusy.current,
      });
    if (!detail || favoriteBusy.current) return;
    const generation = favoriteGeneration.current;
    favoriteBusy.current = true;
    setFavoriteUpdating(true);
    try {
      const result = detail.isFavorited
        ? await unfavoritePopup(detail.publicId)
        : await favoritePopup(detail.publicId);
      if (__DEV__) console.info("[FAVORITE] updated", result);
      setRequestState((current) =>
        favoriteGeneration.current === generation &&
        current.id === detail.publicId &&
        current.detail
          ? {
              ...current,
              detail: {
                ...current.detail,
                isFavorited: result.isFavorited,
                favoriteCount: result.favoriteCount,
              },
            }
          : current,
      );
    } catch (error) {
      if (__DEV__)
        console.info(
          "[FAVORITE] update failed",
          error instanceof Error ? error.message : "unknown error",
        );
      if (error instanceof FavoriteUnauthorizedError) {
        const invalidated = await clearTokens(error.authGeneration).catch(
          () => true,
        );
        if (invalidated === false) return;
        router.push("/profile/login");
      } else {
        Alert.alert(
          t("place.detail.favoriteFailed"),
          t("place.detail.tryLater"),
        );
      }
    } finally {
      favoriteBusy.current = false;
      setFavoriteUpdating(false);
    }
  };

  if (!detail) {
    const isError =
      requestState.id === id &&
      requestState.languageCode === languageCode &&
      requestState.status === "error";
    if (!isError) {
      return (
        <SafeAreaView style={styles.container} edges={["bottom"]}>
          <ScrollView contentContainerStyle={styles.content}>
            <PopupDetailSkeleton
              width={width}
              heroHeight={
                (width * 0.78 * 4) / 3 + spacing.space24 * 2 + insets.top
              }
              heroControls={
                <SafeAreaView
                  edges={["top"]}
                  pointerEvents="box-none"
                  style={styles.heroControls}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("place.explore.back")}
                    onPress={() => router.back()}
                    style={styles.heroButton}
                  >
                    <ChevronLeft size={24} color={colors.background} />
                  </Pressable>
                </SafeAreaView>
              }
            />
          </ScrollView>
          {topSafeAreaBackground}
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView style={styles.container}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("place.explore.back")}
          onPress={() => router.back()}
          style={styles.emptyBack}
        >
          <ArrowLeft size={24} color={colors.text} />
        </Pressable>
        <View style={styles.empty}>
          <Text style={styles.valueText}>{t("place.detail.loadFailed")}</Text>
        </View>
        {topSafeAreaBackground}
      </SafeAreaView>
    );
  }

  const latitude = detail.latitude;
  const longitude = detail.longitude;
  const mapCoordinates =
    typeof latitude === "number" &&
    Number.isFinite(latitude) &&
    Math.abs(latitude) <= 90 &&
    typeof longitude === "number" &&
    Number.isFinite(longitude) &&
    Math.abs(longitude) <= 180
      ? { latitude, longitude }
      : null;
  const hasDirections = Boolean(mapCoordinates && isMapPreviewAvailable);
  const hasMapSection = SHOW_LOCATION_MAP && hasDirections;
  const introductionSections = popupIntroductionSections(detail);
  const socialLinks = officialChannelLinks(detail.socialLinks);
  const hasDescriptionContent = introductionSections.length > 0;
  const hasGuidance = introductionSections.some(
    (section) => section.kind === "notice" || section.kind === "benefits",
  );
  const hasDescriptionSection =
    hasDescriptionContent || detail.contentImageUrls.length > 0;
  const reservationUrl =
    detail.reservationUrl && isValidExternalUrl(detail.reservationUrl)
      ? detail.reservationUrl
      : null;
  const reservationTimes = [
    detail.reservationStartAt &&
      t("place.detail.basicInfo.reservationStart", {
        date: formatDateTime(detail.reservationStartAt),
      }),
    detail.reservationEndAt &&
      t("place.detail.basicInfo.reservationEnd", {
        date: formatDateTime(detail.reservationEndAt),
      }),
  ]
    .filter(Boolean)
    .join("\n");
  const period = formatPopupDetailPeriod(detail.startDate, detail.endDate);
  const locationDetail = detail.locationDetail?.trim();
  const hasAddress = Boolean(detail.address?.trim());
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const dayStatus = detailDayStatus(detail, today, resolvedLanguage);
  const openReviews = () => {
    setReviewsVisible(true);
    if (reviewsY.current !== null)
      scrollRef.current?.scrollTo({
        y: Math.max(0, reviewsY.current - insets.top),
        animated: true,
      });
    else pendingReviewScroll.current = true;
  };
  const reviewCount = detail.reviewCount ?? 0;
  const averageRating =
    reviewCount > 0 ? (detail.averageRating ?? 0).toFixed(1) : "0.0";
  const openDirections = () => {
    setDirectionsVisible(true);
  };
  const selectMap = async (service: MapService) => {
    const appIdentifier =
      Platform.OS === "ios"
        ? Constants.expoConfig?.ios?.bundleIdentifier
        : Constants.expoConfig?.android?.package;
    const links = buildMapLinks(service, detail, Platform.OS, appIdentifier);
    if (!links) {
      Alert.alert(
        directionsTranslation.current("place.detail.directions"),
        directionsTranslation.current("place.detail.directionMaps.unavailable"),
      );
      return;
    }
    const result = await openMapLinks(links, Linking, Platform.OS);
    if (result === "failed")
      Alert.alert(
        directionsTranslation.current("place.detail.directions"),
        directionsTranslation.current("place.detail.directionMaps.failed"),
      );
    else if (result === "web" && links.naverWeb)
      Alert.alert(
        directionsTranslation.current("place.detail.directions"),
        directionsTranslation.current("place.detail.directionMaps.naverWeb", {
          destination: links.destination,
        }),
      );
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView
        ref={scrollRef}
        scrollEventThrottle={100}
        onScroll={() => { blogReviewsRef.current?.checkVisibility(); nearbySectionRef.current?.checkVisibility(); similarSectionRef.current?.checkVisibility(); }}
        onContentSizeChange={() => { blogReviewsRef.current?.checkVisibility(); nearbySectionRef.current?.checkVisibility(); similarSectionRef.current?.checkVisibility(); }}
        contentContainerStyle={[styles.content, styles.floatingContentInset]}
      >
        <View style={[styles.hero, { width }]}>
          <PopupHeroImage
            key={detail.publicId}
            uri={detail.coverImageUrl}
            popup={heroPopup(detail)}
            coverScope={coverScope}
            onRecoverCover={recoverHeroCover}
            accessibilityLabel={detail.name}
            topInset={insets.top}
          />
          <SafeAreaView
            edges={["top"]}
            pointerEvents="box-none"
            style={styles.heroControls}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("place.explore.back")}
              onPress={() => router.back()}
              style={styles.heroButton}
            >
              <ChevronLeft size={24} color={colors.background} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("place.detail.share")}
              onPress={() => void Share.share({ message: detail.name })}
              style={styles.heroButton}
            >
              <Share2 size={24} color={colors.background} />
            </Pressable>
          </SafeAreaView>
        </View>

        <View style={styles.infoContent}>
          <View>
            <View style={styles.tags}>
              {detail.tags.map((tag) => (
                <Text key={tag.id} style={styles.metadataTag}>
                  {getTagDisplayName(tag, resolvedLanguage)}
                </Text>
              ))}
              {detail.regionName && (
                <Text style={styles.metadataTag}>
                  {getPopupRegionDisplayName(detail, resolvedLanguage)}
                </Text>
              )}
            </View>
            <Text style={styles.title}>{detail.name}</Text>
            {dayStatus && (
              <View style={styles.dayStatus}>
                <Text
                  style={[styles.dayStatusText, { color: dayStatus.color }]}
                >
                  {dayStatus.label}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.infoSection}>
            <View style={styles.infoRows}>
              <DetailRow
                icon={<CalendarDays size={16} color={colors.secondaryText} />}
                label={t("place.detail.basicInfo.period")}
                alignTop
                webFact
              >
                <Text style={[styles.valueText, styles.infoValueText]}>
                  {period || t("place.detail.basicInfo.pending")}
                </Text>
              </DetailRow>
              <DetailRow
                icon={<Clock3 size={16} color={colors.secondaryText} />}
                label={t("place.detail.basicInfo.time")}
                alignTop
                webFact
              >
                <Text style={[styles.valueText, styles.infoValueText]}>
                  {detail.operatingHours?.trim() ||
                    t("place.detail.basicInfo.pending")}
                </Text>
              </DetailRow>
              <DetailRow
                icon={<MapPin size={16} color={colors.secondaryText} />}
                label={t("place.detail.basicInfo.place")}
                alignTop
                webFact
              >
                <View style={styles.placeDetails}>
                  {hasAddress ? (
                    <Text style={[styles.valueText, styles.infoValueText]}>
                      {detail.address}
                    </Text>
                  ) : null}
                  {locationDetail ? (
                    <Text
                      style={[
                        styles.valueText,
                        styles.infoValueText,
                        styles.addressExtra,
                      ]}
                    >
                      {locationDetail}
                    </Text>
                  ) : null}
                  {!hasAddress && !locationDetail ? (
                    <Text style={[styles.valueText, styles.infoValueText]}>
                      {t("place.detail.basicInfo.addressPending")}
                    </Text>
                  ) : null}
                </View>
              </DetailRow>
              {reservationUrl ? (
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={t("place.detail.basicInfo.reserve")}
                  onPress={() => {
                    void Linking.openURL(reservationUrl).catch(() =>
                      Alert.alert(t("place.detail.channelOpenError")),
                    );
                  }}
                  style={styles.reservationCard}
                >
                  <DetailRow
                    icon={<Ticket size={18} color={colors.primary} />}
                    label={t("place.detail.basicInfo.reservation")}
                    compact
                  >
                    <View style={styles.reservationContent}>
                      {reservationTimes ? (
                        <View style={styles.reservationText}>
                          <Text style={styles.reservationTimes}>
                            {reservationTimes}
                          </Text>
                        </View>
                      ) : null}
                      <View style={styles.reservationAction}>
                        <Text style={styles.reservationActionText}>
                          {t("place.detail.basicInfo.reserve")}
                        </Text>
                        <ChevronRight size={18} color={colors.primary} />
                      </View>
                    </View>
                  </DetailRow>
                </Pressable>
              ) : null}
              {(socialLinks.length > 0 || hasDirections) && (
                <View style={styles.basicActions}>
                  {socialLinks.length > 0 && (
                    <Pressable
                      accessibilityRole={socialLinks.length === 1 ? "link" : "button"}
                      accessibilityState={
                        socialLinks.length > 1
                          ? { expanded: officialChannelsVisible }
                          : undefined
                      }
                      onPress={() => {
                        if (socialLinks.length === 1) {
                          void Linking.openURL(socialLinks[0].url).catch(() =>
                            Alert.alert(t("place.detail.channelOpenError")),
                          );
                        } else {
                          setOfficialChannelsVisible((visible) => !visible);
                        }
                      }}
                      style={[styles.basicActionButton, styles.officialActionButton]}
                    >
                      <Text style={[styles.basicActionText, styles.officialActionText]}>
                        {t("place.detail.officialChannels")}
                      </Text>
                    </Pressable>
                  )}
                  {hasDirections && (
                    <Pressable
                      accessibilityRole="button"
                      onPress={openDirections}
                      style={[styles.basicActionButton, styles.directionsActionButton]}
                    >
                      <Text style={[styles.basicActionText, styles.directionsActionText]}>
                        {t("place.detail.directions")}
                      </Text>
                    </Pressable>
                  )}
                </View>
              )}
              {socialLinks.length > 1 && officialChannelsVisible && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.socialScroller}
                  contentContainerStyle={styles.socialButtons}
                >
                  {socialLinks.map(({ channel, url }) => (
                    <Pressable
                      key={channel}
                      accessibilityRole="link"
                      accessibilityLabel={t(
                        "place.detail.officialChannelLink",
                        { channel: officialChannelLabel(channel, t) },
                      )}
                      onPress={() => {
                        void Linking.openURL(url).catch(() =>
                          Alert.alert(t("place.detail.channelOpenError")),
                        );
                      }}
                      style={styles.socialButton}
                    >
                      <OfficialChannelIcon channel={channel} />
                    </Pressable>
                  ))}
                </ScrollView>
              )}


            </View>
          </View>
          {hasMapSection && mapCoordinates && (
            <View style={styles.mapSection}>
              <View style={styles.mapDivider} />
              <View style={styles.mapFrame}>
                <Text style={styles.sectionTitle}>
                  {t("place.detail.location")}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("place.detail.viewOnMap")}
                  onPress={() =>
                    router.dismissTo({
                      pathname: "/(tabs)/map",
                      params: { popupId: detail.publicId },
                    })
                  }
                  style={styles.mapPreview}
                >
                  <PlaceMapPreview {...mapCoordinates} />
                </Pressable>
              </View>
              <View style={[styles.mapDivider, styles.mapBottomDivider]} />
            </View>
          )}
          {hasDescriptionSection && (
            <View style={!hasMapSection && styles.descriptionSection}>
              {!hasMapSection && <View style={styles.mapDivider} />}
              <View style={styles.descriptionContent}>
                <Text style={styles.sectionTitle}>
                  {t("place.detail.descriptionTitle")}
                </Text>
                <PopupIntroduction
                  key={detail.publicId}
                  sections={introductionSections}
                  detailImages={
                    detail.contentImageUrls.length > 0 ? (
                      <View
                        style={[
                          hasGuidance
                            ? styles.descriptionImagesAfterGuidance
                            : hasDescriptionContent
                              ? styles.descriptionImages
                              : styles.descriptionAfterTitle,
                        ]}
                      >
                        <IntroductionImageCarousel
                          key={detail.publicId}
                          images={detail.contentImageUrls}
                          popupId={detail.publicId}
                          countryCode={detail.countryCode}
                          fetchedAt={detail.contentImageFetchedAt}
                          width={width - spacing.space16 * 2}
                        />
                      </View>
                    ) : null
                  }
                />

                <Pressable
                  disabled
                  accessibilityRole="button"
                  accessibilityLabel={t("place.detail.reportInformation")}
                  accessibilityState={{ disabled: true }}
                  hitSlop={10}
                  style={styles.reportAction}
                >
                  <Text numberOfLines={1} style={styles.reportActionText}>
                    {t("place.detail.reportInformationButton")}
                  </Text>
                </Pressable>
              </View>
              <View style={[styles.mapDivider, styles.mapBottomDivider]} />
            </View>
          )}

        </View>
        <PopupBlogReviews key={`blog:${detail.publicId}`} ref={blogReviewsRef} publicId={detail.publicId} />
        <PopupNearbySection key={`nearby:${detail.publicId}`} ref={nearbySectionRef}
          publicId={detail.publicId} latitude={detail.latitude} longitude={detail.longitude} />
        <PopupSimilarSection key={`similar:${detail.publicId}`} ref={similarSectionRef} publicId={detail.publicId} />
        {reviewsVisible && (
          <View
            onLayout={({ nativeEvent: { layout } }) => {
              reviewsY.current = layout.y;
              if (pendingReviewScroll.current) {
                pendingReviewScroll.current = false;
                scrollRef.current?.scrollTo({
                  y: Math.max(0, layout.y - insets.top),
                  animated: true,
                });
              }
            }}
          >
            <PopupReviews publicId={detail.publicId} title={detail.name} />
          </View>
        )}
      </ScrollView>
      {topSafeAreaBackground}
      <Pressable
        testID="popup-floating-favorite"
        accessibilityRole="button"
        accessibilityLabel={t(
          detail.isFavorited
            ? "place.all.removeFavorite"
            : "place.all.addFavorite",
        )}
        accessibilityState={{
          selected: detail.isFavorited,
          disabled: isFavoriteUpdating,
        }}
        disabled={isFavoriteUpdating}
        onPress={() => void toggleFavorite()}
        style={[
          styles.floatingFavorite,
          {
            right: insets.right + spacing.space16,
            bottom:
              insets.bottom +
              (FLOATING_TAB_BAR_BOTTOM_GAP + FLOATING_TAB_BAR_HEIGHT) / 2 +
              spacing.space16,
          },
        ]}
      >
        <Heart
          size={18}
          color={colors.background}
          fill={detail.isFavorited ? colors.background : "none"}
        />
        <Text style={styles.floatingFavoriteText}>
          {t(
            detail.isFavorited
              ? "place.detail.favorited"
              : "place.all.addFavorite",
          )}
        </Text>
      </Pressable>
      {directionsVisible && (
        <DirectionsSheet
          onClose={() => setDirectionsVisible(false)}
          onSelect={(service) => {
            void selectMap(service);
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topSafeAreaBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    zIndex: 20,
    elevation: 20,
  },
  content: { paddingBottom: spacing.space40 },
  hero: { position: "relative" },
  heroControls: {
    position: "absolute",
    // SafeAreaView adds its top inset to this padding, preserving button Y.
    top: 0,
    paddingTop: spacing.space12,
    left: spacing.space16,
    right: spacing.space16,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  heroButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.25,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  floatingContentInset: { paddingBottom: spacing.space40 },
  floatingFavorite: {
    position: "absolute",
    height: 48,
    paddingHorizontal: spacing.space16,
    flexDirection: "row",
    alignItems: "center",
    columnGap: spacing.space8,
    borderRadius: radius.full,
    backgroundColor: "#FF5A6E",
    shadowColor: "#000000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  floatingFavoriteText: {
    ...typography.label,
    fontWeight: "600",
    color: colors.background,
  },
  infoContent: {
    paddingTop: spacing.space24,
    paddingHorizontal: spacing.space16,
  },
  title: {
    marginTop: spacing.space8,
    fontSize: 24,
    fontWeight: "700",
    lineHeight: 28,
    color: colors.text,
  },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: spacing.space8 },
  metadataTag: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 5,
    backgroundColor: "#F5F5F7",
    color: colors.text,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 18,
  },
  dayStatus: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
  },
  dayStatusText: { fontSize: 18, fontWeight: "600", lineHeight: 26 },
  infoSection: { marginTop: 16 },
  mapSection: { marginTop: spacing.space24 },
  mapDivider: {
    height: 8,
    marginHorizontal: -spacing.space16,
    backgroundColor: "#F5F6F8",
  },
  mapBottomDivider: { marginTop: spacing.space24 },
  descriptionSection: { marginTop: spacing.space24 },
  descriptionContent: { marginTop: spacing.space24 },
  descriptionAfterTitle: { marginTop: spacing.space16 },
  descriptionImages: { marginTop: spacing.space24 },
  descriptionImagesAfterGuidance: { marginTop: spacing.space20 },
  reportAction: { alignSelf: "flex-end", marginTop: spacing.space16 },
  reportActionText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.secondaryText,
  },
  socialScroller: { flexShrink: 1 },
  socialButtons: {
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    columnGap: spacing.space12,
  },
  socialButton: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  mapFrame: { marginTop: spacing.space24 },
  mapPreview: { marginTop: spacing.space12 },
  basicActions: { flexDirection: "column", gap: spacing.space8, marginTop: 12 },
  basicActionButton: {
    width: "100%",
    minWidth: 0,
    minHeight: 44,
    paddingVertical: spacing.space8,
    paddingHorizontal: spacing.space12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 5,
    backgroundColor: colors.background,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    columnGap: spacing.space6,
  },
  basicActionText: { fontSize: 14, fontWeight: "600", color: colors.text },
  officialActionButton: { backgroundColor: "#171717", borderColor: "#171717" },
  officialActionText: { color: colors.background },
  directionsActionButton: { backgroundColor: "#E9E9ED", borderWidth: 0 },
  directionsActionText: { color: "#171717" },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 26,
    color: colors.text,
  },
  infoRows: {
    flexDirection: "column",
    gap: spacing.space6,
  },
  infoRow: { minHeight: 20, flexDirection: "row", alignItems: "center" },
  infoRowTop: { alignItems: "flex-start" },
  rowIcon: {
    width: 20,
    flexShrink: 0,
    marginRight: spacing.space8,
    alignItems: "flex-end",
  },
  rowIconTop: { paddingTop: 1 },
  rowLabel: {
    width: 78,
    flexShrink: 0,
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 20,
    color: colors.secondaryText,
  },
  rowValue: { flex: 1, minWidth: 0 },
  valueText: {
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 20,
    color: colors.text,
  },
  infoValueText: {
    textAlign: "left",
    fontSize: 14,
    fontWeight: "400",
    lineHeight: 22,
  },
  addressExtra: { color: colors.secondaryText },
  factLabel: { width: 68, fontSize: 14, fontWeight: "400", lineHeight: 22 },
  factIcon: { width: 16, marginRight: 8, paddingTop: 3 },
  factValue: { marginLeft: 12 },
  reservationLabel: { width: 40 },
  reservationCard: {
    minHeight: 48,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.radius12,
    backgroundColor: "#F0FDF4",
    paddingVertical: spacing.space4,
    paddingHorizontal: spacing.space12,
  },
  reservationContent: {
    flexDirection: "row",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: spacing.space8,
    rowGap: spacing.space4,
  },
  reservationText: { flexGrow: 1, flexShrink: 1, flexBasis: 88, minWidth: 0 },
  reservationTimes: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.secondaryText,
    textAlign: "center",
  },
  reservationAction: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: spacing.space4,
    flexShrink: 0,
  },
  reservationActionText: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    color: colors.primaryDark,
  },
  placeDetails: { gap: spacing.space4 },
  emptyBack: {
    width: 48,
    height: 48,
    marginLeft: spacing.space8,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: { flex: 1, alignItems: "center", justifyContent: "center" },
});
