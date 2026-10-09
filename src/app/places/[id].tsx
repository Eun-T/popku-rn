import { getPopupRegionDisplayName, getTagDisplayName } from '../../locales/filterLabels';
import { useTranslation } from '../../hooks/useTranslation';
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Heart,
  MapPin,
  MessageCircle,
  Share2,
  Star,
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
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import Tag from "../../components/common/Tag";
import DirectionsSheet from '../../components/place/DirectionsSheet';
import Constants from 'expo-constants';
import { buildMapLinks, openMapLinks, type MapService } from '../../lib/mapDirections';
import {
  FLOATING_TAB_BAR_BOTTOM_GAP,
  FLOATING_TAB_BAR_HEIGHT,
} from "../../components/navigation/FloatingTabBar";
import IntroductionImageCarousel from "../../components/place/IntroductionImageCarousel";
import OfficialChannelIcon from "../../components/place/OfficialChannelIcon";
import PlaceMapPreview, {
  isMapPreviewAvailable,
} from "../../components/place/PlaceMapPreview";
import PopupDetailSkeleton from "../../components/place/PopupDetailSkeleton";
import PopupGuidanceCarousel from "../../components/place/PopupGuidanceCarousel";
import PopupHeroImage from "../../components/place/PopupHeroImage";
import PopupReviews from "../../components/place/PopupReviews";
import {
  clearTokens,
  getAuthSession,
  getAuthUser,
  subscribeAuthUser,
} from "../../lib/auth";
import {
  favoritePopup,
  FavoriteUnauthorizedError,
  unfavoritePopup,
} from "../../lib/favorites";
import {
  highlightHeading,
  isValidExternalUrl,
  officialChannelLabel,
  officialChannelLinks,
  popupSummary,
  visiblePopupHighlights,
} from "../../lib/popupDetailContent";
import {
  getPopupDetail,
  PopupDetailUnauthorizedError,
  type PublicPopupDetail,
} from "../../lib/popups";
import { popupOperatingStatus } from "../../lib/popupStatus";
import { subscribeReviews } from "../../lib/reviews";
import { getApiLocale, type Locale } from "../../locales";
import { colors, radius, spacing, typography } from "../../theme/tokens";

type DetailRowProps = {
  icon: ReactNode;
  label: string;
  children: ReactNode;
  alignTop?: boolean;
  compact?: boolean;
};
type DetailTab = "info" | "reviews";
type DetailState = {
  id: string | undefined;
  languageCode: Locale;
  status: "loading" | "ready" | "error";
  detail: PublicPopupDetail | null;
};

type DetailTabsProps = {
  selectedTab: DetailTab;
  onSelectInfo: () => void;
  onSelectReviews: () => void;
};

function DetailTabs({
  selectedTab,
  onSelectInfo,
  onSelectReviews,
}: DetailTabsProps) {
  const { t, resolvedLanguage } = useTranslation();
  return (
    <View style={styles.tabs}>
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: selectedTab === "info" }}
        onPress={onSelectInfo}
        style={styles.tab}
      >
        <Text
          style={[
            styles.tabText,
            selectedTab === "info" && styles.activeTabText,
          ]}
        >
          {t("place.detail.infoTab")}
        </Text>
        {selectedTab === "info" && <View style={styles.tabIndicator} />}
      </Pressable>
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: selectedTab === "reviews" }}
        onPress={onSelectReviews}
        style={styles.tab}
      >
        <Text
          style={[
            styles.tabText,
            selectedTab === "reviews" && styles.activeTabText,
          ]}
        >
          {t("community.reviewFilterLabel")}
        </Text>
        {selectedTab === "reviews" && <View style={styles.tabIndicator} />}
      </Pressable>
    </View>
  );
}

function DetailRow({
  icon,
  label,
  children,
  alignTop = false,
  compact = false,
}: DetailRowProps) {
  return (
    <View style={[styles.infoRow, alignTop && styles.infoRowTop]}>
      <View style={[styles.rowIcon, alignTop && styles.rowIconTop]}>
        {icon}
      </View>
      <Text style={[styles.rowLabel, compact && styles.reservationLabel]}>
        {label}
      </Text>
      <View style={styles.rowValue}>{children}</View>
    </View>
  );
}

function formatDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${year}.${month}.${day}`;
}

function formatDateTime(value: string): string {
  const [date, time] = value.split("T");
  return `${formatDate(date)} ${time?.slice(0, 5) ?? ""}`.trim();
}

export default function PlaceDetail() {
  const { t, resolvedLanguage } = useTranslation();
  const { id, tab } = useLocalSearchParams<{ id: string; tab?: string }>();
  const router = useRouter();
  const languageCode = getApiLocale();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const authUser = useSyncExternalStore(
    subscribeAuthUser,
    getAuthUser,
    getAuthUser,
  );
  const [isFavoriteUpdating, setFavoriteUpdating] = useState(false);
  const favoriteBusy = useRef(false);
  const favoriteGeneration = useRef(0);
  const refreshReviews = useRef<(() => void) | null>(null);
  const [selectedTab, setSelectedTab] = useState<DetailTab>("info");
  const [directionsVisible, setDirectionsVisible] = useState(false);
  const directionsTranslation = useRef(t);
  useEffect(() => { directionsTranslation.current = t; }, [t]);
  const [isTabPinned, setTabPinned] = useState(false);
  const [requestState, setRequestState] = useState<DetailState>({
    id,
    languageCode,
    status: "loading",
    detail: null,
  });

  useEffect(() => {
    setSelectedTab(tab === "reviews" ? "reviews" : "info");
    setTabPinned(false);
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
      const readVersion = version;
      request = controller;
      dirty = false;
      void getAuthSession()
        .then(async ({ accessToken: token, generation }) => {
          if (controller.signal.aborted) throw new Error("Popup detail read aborted");
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
            );
          } catch (error) {
            if (
              token &&
              error instanceof PopupDetailUnauthorizedError &&
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
                typeof detail.reviewCount !== "number" || !Number.isSafeInteger(detail.reviewCount) || detail.reviewCount < 0 ||
                typeof detail.averageRating !== "number" || !Number.isFinite(detail.averageRating) ||
                detail.averageRating < 0 || detail.averageRating > 5
              ) {
                throw new Error("Invalid popup review summary");
              }
              // The public detail GET is authoritative for aggregates only. A review
              // refresh must not overwrite a favorite mutation made during this GET.
              setRequestState(current =>
                current.id === id && current.languageCode === languageCode && current.detail
                  ? { ...current, detail: { ...current.detail, reviewCount: detail.reviewCount, averageRating: detail.averageRating } }
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
            setRequestState({ id, languageCode, status: "ready", detail });
            summaryOnly = true;
          }
        })
        .catch(() => {
          if (active && !controller.signal.aborted && readVersion === version) {
            if (summaryOnly) dirty = true;
            else setRequestState({ id, languageCode, status: "error", detail: null });
          }
        })
        .finally(() => {
          if (request !== controller) return;
          request = null;
        });
    }
    const unsubscribe = subscribeReviews(changed => {
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

  useFocusEffect(useCallback(() => { refreshReviews.current?.(); }, [id, authUser, languageCode]));

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
        Alert.alert(t("place.detail.favoriteFailed"), t("place.detail.tryLater"));
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
              heroControls={
                <View
                  style={[
                    styles.heroControls,
                    { top: insets.top + spacing.space12 },
                  ]}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("place.explore.back")}
                    onPress={() => router.back()}
                    style={styles.heroButton}
                  >
                    <ChevronLeft size={24} color={colors.background} />
                  </Pressable>
                </View>
              }
              tabs={
                <View style={styles.tabSlot}>
                  <DetailTabs
                    selectedTab="info"
                    onSelectInfo={() => {}}
                    onSelectReviews={() => {}}
                  />
                </View>
              }
            />
          </ScrollView>
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
  const hasMapSection = Boolean(mapCoordinates && isMapPreviewAvailable);
  const summary = popupSummary(detail.summary);
  const highlights = visiblePopupHighlights(detail.highlights);
  const hasDescriptionContent = !!summary || highlights.length > 0;
  const hasDescriptionSection =
    hasDescriptionContent || detail.contentImageUrls.length > 0;
  const socialLinks = officialChannelLinks(detail.socialLinks);
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
  const period = [
    detail.startDate && formatDate(detail.startDate),
    detail.endDate && formatDate(detail.endDate),
  ]
    .filter(Boolean)
    .join(" - ");
  const locationDetail = detail.locationDetail?.trim();
  const hasAddress = Boolean(detail.address?.trim());
  const status = popupOperatingStatus(detail.startDate, detail.endDate);
  const statusVariant =
    status === "운영 중"
      ? "primary"
      : status === "오픈 예정"
        ? "info"
        : "neutral";
  const openReviews = () => {
    setSelectedTab("reviews");
    scrollRef.current?.scrollTo({ y: width, animated: true });
  };
  const reviewCount = detail.reviewCount ?? 0;
  const averageRating = reviewCount > 0 ? (detail.averageRating ?? 0).toFixed(1) : "—";
  const openDirections = () => {
    setDirectionsVisible(true);
  };
  const selectMap = async (service: MapService) => {
    const appIdentifier = Platform.OS === 'ios' ? Constants.expoConfig?.ios?.bundleIdentifier
      : Constants.expoConfig?.android?.package;
    const links = buildMapLinks(service, detail, Platform.OS, appIdentifier);
    if (!links) {
      Alert.alert(directionsTranslation.current('place.detail.directions'),
        directionsTranslation.current('place.detail.directionMaps.unavailable'));
      return;
    }
    const result = await openMapLinks(links, Linking, Platform.OS);
    if (result === 'failed') Alert.alert(directionsTranslation.current('place.detail.directions'),
      directionsTranslation.current('place.detail.directionMaps.failed'));
    else if (result === 'web' && links.naverWeb) Alert.alert(directionsTranslation.current('place.detail.directions'),
      directionsTranslation.current('place.detail.directionMaps.naverWeb', { destination: links.destination }));
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, styles.floatingContentInset]}
        scrollEventThrottle={16}
        onScroll={(event) =>
          setTabPinned(event.nativeEvent.contentOffset.y >= width - insets.top)
        }
      >
        <View style={[styles.hero, { width, height: width }]}>
          <PopupHeroImage
            key={detail.coverImageUrl ?? "placeholder"}
            uri={detail.coverImageUrl}
            accessibilityLabel={detail.name}
            topInset={insets.top}
          />
          <View
            style={[styles.heroControls, { top: insets.top + spacing.space12 }]}
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
          </View>
        </View>

        <View style={styles.tabSlot}>
          {!isTabPinned && (
            <DetailTabs
              selectedTab={selectedTab}
              onSelectInfo={() => setSelectedTab("info")}
              onSelectReviews={openReviews}
            />
          )}
        </View>

        {selectedTab === "info" ? (
          <View style={styles.infoContent}>
            <View>
              <View style={styles.tags}>
                {status && <Tag label={t(status === "운영 중" ? "place.filters.operationStatuses.open" : status === "오픈 예정" ? "place.filters.operationStatuses.upcoming" : "place.filters.operationStatuses.closed")} variant={statusVariant} />}
                {detail.regionName && <Tag label={getPopupRegionDisplayName(detail, resolvedLanguage)} />}
                {detail.tags.map((tag) => (
                  <Tag key={tag.id} label={getTagDisplayName(tag, resolvedLanguage)} />
                ))}
              </View>
              <Text numberOfLines={1} ellipsizeMode="tail" style={styles.title}>
                {detail.name}
              </Text>
              <View style={styles.stats}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t(detail.isFavorited ? "place.all.removeFavorite" : "place.all.addFavorite")}
                  accessibilityState={{
                    selected: detail.isFavorited,
                    disabled: isFavoriteUpdating,
                  }}
                  disabled={isFavoriteUpdating}
                  onPress={() => void toggleFavorite()}
                  style={styles.stat}
                >
                  <Heart
                    size={18}
                    color="#FF5A6E"
                    fill={detail.isFavorited ? "#FF5A6E" : "none"}
                  />
                  <Text style={[styles.statText, styles.favoriteCount]}>{detail.favoriteCount}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={reviewCount > 0 ? t("place.detail.ratingReviews", { rating: averageRating }) : t("place.detail.noRatingReviews")}
                  onPress={openReviews}
                  style={styles.stat}
                >
                  <Star size={18} color="#F5B800" fill="#F5B800" />
                  <Text style={styles.statText}>{averageRating}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("place.detail.openReviews")}
                  onPress={openReviews}
                  style={styles.stat}
                >
                  <MessageCircle size={18} color="#5B8DEF" fill="#5B8DEF" />
                  <Text style={styles.statText}>{reviewCount > 0 ? t("place.detail.reviewCount", { count: reviewCount }) : t("place.detail.reviewLabel")}</Text>
                  <ChevronRight size={16} color={colors.secondaryText} />
                </Pressable>
              </View>
            </View>

            <PopupGuidanceCarousel
              popupId={detail.publicId}
              languageCode={languageCode}
              notice={detail.notice}
              benefits={detail.benefits}
            />

            <View style={styles.infoSection}>
              <View style={styles.infoRows}>
                <DetailRow
                  icon={<CalendarDays size={18} color={colors.secondaryText} />}
                  label={t("place.detail.basicInfo.period")}
                  alignTop
                >
                  <Text style={[styles.valueText, styles.infoValueText]}>
                    {period || t("place.detail.basicInfo.pending")}
                  </Text>
                </DetailRow>
                <DetailRow
                  icon={<Clock3 size={18} color={colors.secondaryText} />}
                  label={t("place.detail.basicInfo.time")}
                  alignTop
                >
                  <Text
                    numberOfLines={2}
                    ellipsizeMode="tail"
                    style={[styles.valueText, styles.infoValueText]}
                  >
                    {detail.operatingHours?.trim() ||
                      t("place.detail.basicInfo.pending")}
                  </Text>
                </DetailRow>
                <DetailRow
                  icon={<MapPin size={18} color={colors.secondaryText} />}
                  label={t("place.detail.basicInfo.place")}
                  alignTop
                >
                  <View style={styles.placeDetails}>
                    {hasAddress ? (
                      <Text style={[styles.valueText, styles.infoValueText]}>
                        {detail.address}
                      </Text>
                    ) : null}
                    {locationDetail ? (
                      <Text style={[styles.valueText, styles.infoValueText]}>
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
              </View>
            </View>
            {mapCoordinates && isMapPreviewAvailable && (
              <View style={styles.mapSection}>
                <View style={styles.mapDivider} />
                <View style={styles.mapFrame}>
                  <Text style={styles.sectionTitle}>{t("place.detail.location")}</Text>
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
                  <Pressable
                    accessibilityRole="button"
                    onPress={openDirections}
                    style={styles.directionsButton}
                  >
                    <Text style={styles.directionsText}>{t("place.detail.directions")}</Text>
                    <ArrowUpRight size={16} color={colors.text} />
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
                    {t("place.detail.about")}
                  </Text>
                  {summary && (
                    <Text
                      style={[
                        styles.descriptionText,
                        styles.descriptionAfterTitle,
                      ]}
                    >
                      {summary}
                    </Text>
                  )}
                  {highlights.length > 0 && (
                    <View
                      style={[
                        styles.highlights,
                        summary
                          ? styles.descriptionAfterBenefit
                          : styles.descriptionAfterTitle,
                      ]}
                    >
                      {highlights.map((highlight, index) => {
                        const heading = highlightHeading(highlight.type);
                        return (
                          <View key={`${index}-${highlight.type}`}>
                            <View style={styles.highlightHeading}>
                              <Text
                                accessible={false}
                                accessibilityElementsHidden
                                importantForAccessibility="no"
                                style={styles.highlightEmoji}
                              >
                                {heading.emoji}
                              </Text>
                              <Text
                                style={[
                                  styles.benefitTitle,
                                  styles.highlightTitle,
                                ]}
                              >
                                {t(heading.key)}
                              </Text>
                            </View>
                            <Text
                              style={[
                                styles.descriptionText,
                                styles.highlightText,
                              ]}
                            >
                              {highlight.text}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  )}
                  {detail.contentImageUrls.length > 0 && (
                    <View
                      style={[
                        hasDescriptionContent
                          ? styles.descriptionImages
                          : styles.descriptionAfterTitle,
                      ]}
                    >
                      <IntroductionImageCarousel
                        key={detail.publicId}
                        images={detail.contentImageUrls}
                        width={width - spacing.space16 * 2}
                      />
                    </View>
                  )}
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
            {socialLinks.length > 0 && (
              <View>
                <View style={styles.officialContent}>
                  <Text numberOfLines={1} style={styles.sectionTitle}>
                    {t("place.detail.officialChannels")}
                  </Text>
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
                </View>
                <View style={[styles.mapDivider, styles.mapBottomDivider]} />
              </View>
            )}
          </View>
        ) : (
          <PopupReviews publicId={detail.publicId} title={detail.name} />
        )}
      </ScrollView>
      {isTabPinned && (
        <View style={[styles.pinnedTabs, { paddingTop: insets.top }]}>
          <DetailTabs
            selectedTab={selectedTab}
            onSelectInfo={() => setSelectedTab("info")}
            onSelectReviews={openReviews}
          />
        </View>
      )}
      <Pressable
        testID="popup-floating-favorite"
        accessibilityRole="button"
        accessibilityLabel={t(detail.isFavorited ? "place.all.removeFavorite" : "place.all.addFavorite")}
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
          {t(detail.isFavorited ? "place.detail.favorited" : "place.all.addFavorite")}
        </Text>
      </Pressable>
      {directionsVisible && <DirectionsSheet onClose={() => setDirectionsVisible(false)}
        onSelect={service => { void selectMap(service); }} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.space40 },
  hero: { position: "relative" },
  heroControls: {
    position: "absolute",
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
  floatingContentInset: { paddingBottom: 48 + spacing.space16 * 2 },
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
  tabSlot: { width: "100%", height: 56, backgroundColor: colors.background },
  pinnedTabs: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background,
    zIndex: 10,
    elevation: 10,
  },
  tabs: {
    width: "100%",
    height: 56,
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    zIndex: 1,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  tabText: { fontSize: 16, fontWeight: "500", color: colors.secondaryText },
  activeTabText: { fontWeight: "700", color: colors.text },
  tabIndicator: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
    backgroundColor: colors.text,
  },
  infoContent: {
    paddingTop: spacing.space24,
    paddingHorizontal: spacing.space16,
  },
  title: {
    marginTop: spacing.space12,
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 26,
    color: colors.text,
  },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: spacing.space8 },
  stats: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: spacing.space12,
    marginTop: spacing.space12,
  },
  stat: { flexDirection: "row", alignItems: "center", columnGap: 5 },
  statText: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    color: colors.text,
  },
  favoriteCount: { fontVariant: ["tabular-nums"] },
  infoSection: { marginTop: spacing.space24 },
  mapSection: { marginTop: spacing.space24 },
  mapDivider: {
    height: 8,
    marginHorizontal: -spacing.space16,
    backgroundColor: "#F5F6F8",
  },
  mapBottomDivider: { marginTop: spacing.space24 },
  descriptionSection: { marginTop: spacing.space24 },
  descriptionContent: { marginTop: spacing.space24 },
  benefitTitle: {
    flexShrink: 0,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    color: colors.text,
  },
  descriptionText: {
    fontSize: 14,
    fontWeight: "400",
    lineHeight: 22,
    color: colors.text,
  },
  descriptionAfterBenefit: { marginTop: spacing.space24 },
  descriptionAfterTitle: { marginTop: spacing.space16 },
  descriptionImages: { marginTop: spacing.space20 },
  highlights: { gap: spacing.space24 },
  highlightHeading: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: spacing.space6,
  },
  highlightTitle: { flex: 1, flexShrink: 1 },
  highlightEmoji: { fontSize: 16 },
  highlightText: { marginTop: spacing.space8 },
  reportAction: { alignSelf: "flex-end", marginTop: spacing.space16 },
  reportActionText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.secondaryText,
  },
  officialContent: {
    marginTop: spacing.space24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  socialScroller: { flexShrink: 1, marginLeft: spacing.space12 },
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
  directionsButton: {
    width: "100%",
    height: 48,
    marginTop: spacing.space12,
    paddingHorizontal: spacing.space16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.radius12,
    backgroundColor: colors.background,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    columnGap: spacing.space6,
  },
  directionsText: { fontSize: 15, fontWeight: "600", color: colors.text },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 26,
    color: colors.text,
  },
  infoRows: { flexDirection: "column", gap: spacing.space12 },
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
  infoValueText: { textAlign: "right" },
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
