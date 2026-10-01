import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, ArrowUpRight, CalendarDays, ChevronRight, Clock3, Copy, Gift, Heart, MapPin, MessageCircle, Share2, Star, Ticket } from 'lucide-react-native';
import { Image, Linking, Pressable, ScrollView, Share, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import Tag from '../../components/common/Tag';
import IntroductionImageCarousel from '../../components/place/IntroductionImageCarousel';
import OfficialChannelIcon, { type SocialChannel } from '../../components/place/OfficialChannelIcon';
import PopupDetailSkeleton from '../../components/place/PopupDetailSkeleton';
import PlaceMapPreview, { isMapPreviewAvailable } from '../../components/place/PlaceMapPreview';
import { getPopupDetail, type PublicPopupDetail } from '../../lib/popups';
import { t } from '../../locales';
import { colors, radius, spacing } from '../../theme/tokens';

type DetailRowProps = { icon: ReactNode; label: string; children: ReactNode; alignTop?: boolean };
type DetailTab = 'info' | 'reviews';
type DetailState = { id: string | undefined; status: 'loading' | 'ready' | 'error'; detail: PublicPopupDetail | null };

const placeholderImage = require('../../../assets/images/ranking-placeholder.png');

const socialChannelOrder: readonly SocialChannel[] = ['instagram', 'x', 'youtube', 'threads', 'facebook'];
const socialChannelLabels: Record<SocialChannel, string> = {
  instagram: 'Instagram',
  x: 'X',
  youtube: 'YouTube',
  threads: 'Threads',
  facebook: 'Facebook',
};

function isValidExternalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && !!url.hostname;
  } catch {
    return false;
  }
}

type DetailTabsProps = {
  selectedTab: DetailTab;
  onSelectInfo: () => void;
  onSelectReviews: () => void;
};

function DetailTabs({ selectedTab, onSelectInfo, onSelectReviews }: DetailTabsProps) {
  return (
    <View style={styles.tabs}>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: selectedTab === 'info' }} onPress={onSelectInfo} style={styles.tab}>
        <Text style={[styles.tabText, selectedTab === 'info' && styles.activeTabText]}>팝업 정보</Text>
        {selectedTab === 'info' && <View style={styles.tabIndicator} />}
      </Pressable>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: selectedTab === 'reviews' }} onPress={onSelectReviews} style={styles.tab}>
        <Text style={[styles.tabText, selectedTab === 'reviews' && styles.activeTabText]}>방문 리뷰</Text>
        {selectedTab === 'reviews' && <View style={styles.tabIndicator} />}
      </Pressable>
    </View>
  );
}

function DetailRow({ icon, label, children, alignTop = false }: DetailRowProps) {
  return (
    <View style={[styles.infoRow, alignTop && styles.infoRowTop]}>
      <View style={[styles.rowIcon, alignTop && styles.rowIconTop]}>{icon}</View>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowValue}>{children}</View>
    </View>
  );
}

function formatDate(value: string): string {
  const [year, month, day] = value.split('-');
  return `${year}.${month}.${day}`;
}

function formatDateTime(value: string): string {
  const [date, time] = value.split('T');
  return `${formatDate(date)} ${time?.slice(0, 5) ?? ''}`.trim();
}

function dateAtMidnight(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export default function PlaceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [isFavorite, setFavorite] = useState(false);
  const [selectedTab, setSelectedTab] = useState<DetailTab>('info');
  const [isTabPinned, setTabPinned] = useState(false);
  const [requestState, setRequestState] = useState<DetailState>({ id, status: 'loading', detail: null });

  useEffect(() => {
    setFavorite(false);
    setSelectedTab('info');
    setTabPinned(false);
    if (!id) {
      setRequestState({ id, status: 'error', detail: null });
      return;
    }
    const controller = new AbortController();
    setRequestState({ id, status: 'loading', detail: null });
    getPopupDetail(id, controller.signal)
      .then((detail) => {
        if (!controller.signal.aborted) setRequestState({ id, status: 'ready', detail });
      })
      .catch(() => {
        if (!controller.signal.aborted) setRequestState({ id, status: 'error', detail: null });
      });
    return () => controller.abort();
  }, [id]);

  const detail = requestState.id === id && requestState.status === 'ready' ? requestState.detail : null;

  if (!detail) {
    const isError = requestState.id === id && requestState.status === 'error';
    if (!isError) {
      return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
          <ScrollView contentContainerStyle={styles.content}>
            <PopupDetailSkeleton
              width={width}
              heroControls={(
                <View style={[styles.heroControls, { top: insets.top + spacing.space12 }]}>
                  <Pressable accessibilityRole="button" accessibilityLabel={t('place.explore.back')} onPress={() => router.back()} style={styles.heroButton}>
                    <ArrowLeft size={20} color={colors.text} />
                  </Pressable>
                </View>
              )}
              tabs={<View style={styles.tabSlot}><DetailTabs selectedTab="info" onSelectInfo={() => {}} onSelectReviews={() => {}} /></View>}
            />
          </ScrollView>
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView style={styles.container}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('place.explore.back')} onPress={() => router.back()} style={styles.emptyBack}>
          <ArrowLeft size={24} color={colors.text} />
        </Pressable>
        <View style={styles.empty}>
          <Text style={styles.valueText}>팝업 정보를 불러오지 못했습니다.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const latitude = detail.latitude;
  const longitude = detail.longitude;
  const mapCoordinates = typeof latitude === 'number' && Number.isFinite(latitude) && Math.abs(latitude) <= 90
    && typeof longitude === 'number' && Number.isFinite(longitude) && Math.abs(longitude) <= 180
    ? { latitude, longitude }
    : null;
  const hasMapSection = Boolean(mapCoordinates && isMapPreviewAvailable);
  const hasBenefits = Boolean(detail.benefits?.trim());
  const hasIntroduction = Boolean(detail.introduction?.trim());
  const socialData = detail.socialLinks && typeof detail.socialLinks === 'object' && !Array.isArray(detail.socialLinks)
    ? detail.socialLinks as Record<string, unknown> : null;
  const socialLinks = socialChannelOrder.flatMap((channel) => {
    const url = socialData?.[channel];
    return typeof url === 'string' && isValidExternalUrl(url) ? [{ channel, url }] : [];
  });
  const reservationUrl = detail.reservationUrl && isValidExternalUrl(detail.reservationUrl) ? detail.reservationUrl : null;
  const reservationTimes = [
    detail.reservationStartAt && `시작 ${formatDateTime(detail.reservationStartAt)}`,
    detail.reservationEndAt && `종료 ${formatDateTime(detail.reservationEndAt)}`,
  ].filter(Boolean).join('\n');
  const period = [detail.startDate && formatDate(detail.startDate), detail.endDate && formatDate(detail.endDate)]
    .filter(Boolean).join(' - ');
  const locationDetail = detail.locationDetail?.trim();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const status = detail.startDate && today < dateAtMidnight(detail.startDate) ? '오픈 예정'
    : detail.endDate && today > dateAtMidnight(detail.endDate) ? '종료'
      : detail.startDate || detail.endDate ? '운영 중' : null;
  const statusVariant = status === '운영 중' ? 'primary' : status === '오픈 예정' ? 'info' : 'neutral';
  const openReviews = () => {
    setSelectedTab('reviews');
    scrollRef.current?.scrollTo({ y: width, animated: true });
  };
  const openDirections = () => {
    // Connect a map app or route sheet when navigation is implemented.
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        scrollEventThrottle={16}
        onScroll={(event) => setTabPinned(event.nativeEvent.contentOffset.y >= width - insets.top)}
      >
        <View style={[styles.hero, { width, height: width }]}>
          <Image source={detail.coverImageUrl ? { uri: detail.coverImageUrl } : placeholderImage} resizeMode="cover" style={{ width, height: width }} />
          <View style={[styles.heroControls, { top: insets.top + spacing.space12 }]}>
            <Pressable accessibilityRole="button" accessibilityLabel={t('place.explore.back')} onPress={() => router.back()} style={styles.heroButton}>
              <ArrowLeft size={20} color={colors.text} />
            </Pressable>
            <View style={styles.rightControls}>
              <Pressable accessibilityRole="button" accessibilityLabel="공유하기" onPress={() => void Share.share({ message: detail.name })} style={styles.heroButton}>
                <Share2 size={20} color={colors.text} />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={isFavorite ? '찜 해제' : '찜하기'} accessibilityState={{ selected: isFavorite }} onPress={() => setFavorite((current) => !current)} style={styles.heroButton}>
                <Heart size={20} color={isFavorite ? colors.primary : colors.text} fill={isFavorite ? colors.primary : 'none'} />
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.tabSlot}>
          {!isTabPinned && (
            <DetailTabs selectedTab={selectedTab} onSelectInfo={() => setSelectedTab('info')} onSelectReviews={openReviews} />
          )}
        </View>

        {selectedTab === 'info' ? <View style={styles.infoContent}>
        <View>
          <View style={styles.tags}>
            {status && <Tag label={status} variant={statusVariant} />}
            {detail.regionName && <Tag label={detail.regionName} />}
            {detail.tags.map((tag) => <Tag key={tag.id} label={tag.name} />)}
          </View>
          <Text numberOfLines={1} ellipsizeMode="tail" style={styles.title}>{detail.name}</Text>
          <View style={styles.stats}>
            <View style={styles.stat}><Heart size={18} color="#FF5A6E" fill="none" /><Text style={styles.statText}>{isFavorite ? '찜함' : '찜'}</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel="별점 정보 없음, 방문 리뷰로 이동" onPress={openReviews} style={styles.stat}>
              <Star size={18} color="#F5B800" fill="none" /><Text style={styles.statText}>별점</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="방문 리뷰로 이동" onPress={openReviews} style={styles.stat}>
              <MessageCircle size={18} color="#5B8DEF" fill="none" />
              <Text style={styles.statText}>후기</Text>
              <ChevronRight size={16} color={colors.secondaryText} />
            </Pressable>
          </View>
        </View>

        {detail.notice?.trim() ? (
          <View style={styles.contentSection}>
            <View style={styles.noticeCard}>
              <View style={styles.noticeHeading}>
                <Text numberOfLines={1} style={styles.noticeTitle}>공지사항</Text>
              </View>
              <Text style={styles.noticePreview}>{detail.notice}</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.infoSection}>
          <View style={styles.infoRows}>
            <DetailRow icon={<CalendarDays size={18} color={colors.secondaryText} />} label="기간">
              <Text style={styles.valueText}>{period || '정보 준비 중'}</Text>
            </DetailRow>
            <DetailRow icon={<Clock3 size={18} color={colors.secondaryText} />} label="운영시간" alignTop>
              <Text numberOfLines={2} ellipsizeMode="tail" style={styles.valueText}>{detail.operatingHours?.trim() || '정보 준비 중'}</Text>
            </DetailRow>
            {(detail.reservationStartAt || detail.reservationEndAt || reservationUrl) && (
              <Pressable
                accessibilityRole={reservationUrl ? 'link' : undefined}
                accessibilityLabel={reservationUrl ? '사전예약 링크 열기' : undefined}
                disabled={!reservationUrl}
                onPress={() => { if (reservationUrl) void Linking.openURL(reservationUrl); }}
              >
                <DetailRow icon={<Ticket size={18} color={colors.secondaryText} />} label="사전예약">
                  <View style={styles.reservationContent}>
                    <Text style={[styles.valueText, styles.reservationText]}>{reservationTimes || '예약하기'}</Text>
                    {reservationUrl && <ChevronRight size={20} color={colors.secondaryText} />}
                  </View>
                </DetailRow>
              </Pressable>
            )}
            <DetailRow icon={<MapPin size={18} color={colors.secondaryText} />} label="장소" alignTop>
              <View style={styles.placeContent}>
                <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.valueText, styles.placeAddress]}>{detail.address || '주소 정보 준비 중'}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="주소 복사" onPress={() => void Clipboard.setStringAsync(detail.address)} style={styles.copyButton}>
                  <Copy size={18} color={colors.secondaryText} />
                </Pressable>
              </View>
            </DetailRow>
            {locationDetail ? (
              <DetailRow icon={<MapPin size={18} color={colors.secondaryText} />} label="위치" alignTop>
                <Text numberOfLines={1} ellipsizeMode="tail" style={styles.valueText}>{locationDetail}</Text>
              </DetailRow>
            ) : null}
          </View>
        </View>
        {mapCoordinates && isMapPreviewAvailable && (
          <View style={styles.mapSection}>
            <View style={styles.mapDivider} />
            <View style={styles.mapFrame}>
              <Text style={styles.sectionTitle}>위치</Text>
              <View style={styles.mapPreview}><PlaceMapPreview {...mapCoordinates} /></View>
              <Pressable accessibilityRole="button" onPress={openDirections} style={styles.directionsButton}>
                <Text style={styles.directionsText}>길찾기</Text>
                <ArrowUpRight size={16} color={colors.text} />
              </Pressable>
            </View>
            <View style={[styles.mapDivider, styles.mapBottomDivider]} />
          </View>
        )}
          <View style={!hasMapSection && styles.introductionSection}>
            {!hasMapSection && <View style={styles.mapDivider} />}
            <View style={styles.introductionContent}>
              <Text style={styles.sectionTitle}>팝업 소개</Text>
              {hasBenefits && (
                <View style={[styles.noticeCard, styles.benefitCard]}>
                  <View style={styles.benefitHeading}>
                    <Gift size={18} color={colors.primary} style={styles.benefitIcon} />
                    <Text numberOfLines={1} style={styles.benefitTitle}>혜택</Text>
                  </View>
                  <Text style={[styles.noticePreview, styles.benefitPreview]}>{detail.benefits}</Text>
                </View>
              )}
              {hasIntroduction && (
                <Text style={[styles.introductionText, hasBenefits ? styles.introductionAfterBenefit : styles.introductionAfterTitle]}>
                  {detail.introduction}
                </Text>
              )}
              {detail.contentImageUrls.length > 0 && (
                <View style={[
                  hasIntroduction ? styles.introductionImages : hasBenefits ? styles.introductionAfterBenefit : styles.introductionAfterTitle,
                ]}>
                  <IntroductionImageCarousel key={detail.publicId} images={detail.contentImageUrls} width={width - spacing.space16 * 2} />
                </View>
              )}
              <Pressable disabled accessibilityRole="button" accessibilityLabel="정보 수정 제보하기" accessibilityState={{ disabled: true }} hitSlop={10} style={styles.reportAction}>
                <Text numberOfLines={1} style={styles.reportActionText}>정보 수정 제보 →</Text>
              </Pressable>
            </View>
            <View style={[styles.mapDivider, styles.mapBottomDivider]} />
          </View>
        {socialLinks.length > 0 && (
          <View>
            <View style={styles.officialContent}>
              <Text numberOfLines={1} style={styles.sectionTitle}>공식 채널</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.socialScroller} contentContainerStyle={styles.socialButtons}>
                  {socialLinks.map(({ channel, url }) => (
                    <Pressable
                      key={channel}
                      accessibilityRole="link"
                      accessibilityLabel={`${socialChannelLabels[channel]} 공식 채널`}
                      onPress={() => void Linking.openURL(url)}
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
        </View> : <View style={[styles.empty, { minHeight: height }]}><Text style={styles.valueText}>아직 등록된 방문 리뷰가 없어요.</Text></View>}
      </ScrollView>
      {isTabPinned && (
        <View style={[styles.pinnedTabs, { paddingTop: insets.top }]}>
          <DetailTabs selectedTab={selectedTab} onSelectInfo={() => setSelectedTab('info')} onSelectReviews={openReviews} />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.space40 },
  hero: { position: 'relative' },
  heroControls: { position: 'absolute', left: spacing.space16, right: spacing.space16, flexDirection: 'row', justifyContent: 'space-between' },
  rightControls: { flexDirection: 'row', columnGap: spacing.space8 },
  heroButton: { width: 32, height: 32, borderRadius: radius.full, backgroundColor: 'rgba(255, 255, 255, 0.88)', alignItems: 'center', justifyContent: 'center' },
  tabSlot: { width: '100%', height: 56, backgroundColor: colors.background },
  pinnedTabs: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: colors.background, zIndex: 10, elevation: 10 },
  tabs: { width: '100%', height: 56, flexDirection: 'row', alignItems: 'stretch', backgroundColor: colors.background, borderBottomWidth: 1, borderBottomColor: colors.border, zIndex: 1 },
  tab: { flex: 1, minWidth: 0, height: 56, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: 16, fontWeight: '500', color: colors.secondaryText },
  activeTabText: { fontWeight: '700', color: colors.text },
  tabIndicator: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, backgroundColor: colors.text },
  infoContent: { paddingTop: spacing.space24, paddingHorizontal: spacing.space16 },
  title: { marginTop: spacing.space12, fontSize: 18, fontWeight: '700', lineHeight: 26, color: colors.text },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.space8 },
  stats: { flexDirection: 'row', alignItems: 'center', columnGap: spacing.space20, marginTop: spacing.space12 },
  stat: { flexDirection: 'row', alignItems: 'center', columnGap: 5 },
  statText: { fontSize: 14, fontWeight: '600', lineHeight: 20, color: colors.text },
  contentSection: { marginTop: 28 },
  infoSection: { marginTop: spacing.space24 },
  mapSection: { marginTop: spacing.space24 },
  mapDivider: { height: 8, marginHorizontal: -spacing.space16, backgroundColor: '#F5F6F8' },
  mapBottomDivider: { marginTop: spacing.space24 },
  introductionSection: { marginTop: spacing.space24 },
  introductionContent: { marginTop: spacing.space24 },
  benefitCard: { marginTop: spacing.space16 },
  benefitHeading: { flexDirection: 'row', alignItems: 'center', columnGap: 10 },
  benefitIcon: { marginTop: 1 },
  benefitTitle: { flexShrink: 0, fontSize: 14, fontWeight: '600', lineHeight: 20, color: colors.text },
  benefitPreview: { marginTop: spacing.space8 },
  introductionText: { fontSize: 14, fontWeight: '400', lineHeight: 22, color: colors.text },
  introductionAfterBenefit: { marginTop: spacing.space24 },
  introductionAfterTitle: { marginTop: spacing.space16 },
  introductionImages: { marginTop: spacing.space20 },
  reportAction: { alignSelf: 'flex-end', marginTop: spacing.space16 },
  reportActionText: { fontSize: 13, fontWeight: '600', color: colors.secondaryText },
  officialContent: { marginTop: spacing.space24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  socialScroller: { flexShrink: 1, marginLeft: spacing.space12 },
  socialButtons: { flexGrow: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', columnGap: spacing.space12 },
  socialButton: { width: 44, height: 44, borderRadius: radius.full, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  mapFrame: { marginTop: spacing.space24 },
  mapPreview: { marginTop: spacing.space12 },
  directionsButton: { width: '100%', height: 48, marginTop: spacing.space12, paddingHorizontal: spacing.space16, borderWidth: 1, borderColor: colors.border, borderRadius: radius.radius12, backgroundColor: colors.background, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: spacing.space6 },
  directionsText: { fontSize: 15, fontWeight: '600', color: colors.text },
  sectionTitle: { fontSize: 18, fontWeight: '700', lineHeight: 26, color: colors.text },
  noticeCard: { minHeight: 72, paddingVertical: 14, paddingHorizontal: spacing.space16, borderRadius: radius.radius12, backgroundColor: '#F7F8FA' },
  noticeHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', columnGap: spacing.space8 },
  noticeTitle: { flex: 1, fontSize: 14, fontWeight: '600', lineHeight: 20, color: colors.text },
  noticePreview: { marginTop: spacing.space6, fontSize: 13, lineHeight: 19, color: colors.secondaryText },
  infoRows: { flexDirection: 'column', gap: spacing.space4 },
  infoRow: { minHeight: 32, flexDirection: 'row', alignItems: 'center' },
  infoRowTop: { alignItems: 'flex-start' },
  rowIcon: { width: 20, marginRight: spacing.space8, alignItems: 'flex-end' },
  rowIconTop: { paddingTop: 1 },
  rowLabel: { width: 78, fontSize: 14, fontWeight: '500', lineHeight: 20, color: colors.secondaryText },
  rowValue: { flex: 1, minWidth: 0 },
  valueText: { fontSize: 14, fontWeight: '500', lineHeight: 20, color: colors.text },
  reservationContent: { flexDirection: 'row', alignItems: 'center', columnGap: spacing.space6 },
  reservationText: { flex: 1 },
  placeContent: { flexDirection: 'row', alignItems: 'flex-start', minWidth: 0 },
  placeAddress: { flex: 1, minWidth: 0 },
  copyButton: { width: 36, height: 36, flexShrink: 0, marginLeft: spacing.space6, alignItems: 'center', justifyContent: 'center' },
  emptyBack: { width: 48, height: 48, marginLeft: spacing.space8, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
