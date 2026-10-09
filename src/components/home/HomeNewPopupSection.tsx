import { getPopupRegionDisplayName, getTagDisplayName } from '../../locales/filterLabels';
import { useMemo, useState } from 'react';
import { useTheme } from '../../theme/useTheme';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type ImageSourcePropType } from 'react-native';

import { useHomePopups } from '../../hooks/useHomePopups';
import { usePopupFavorites } from '../../hooks/usePopupFavorites';
import { useTranslation } from '../../hooks/useTranslation';
import { colors, spacing, typography } from '../../theme/tokens';
import { currentWeekRange } from '../../lib/popups';
import { popupOperatingStatus } from '../../lib/popupStatus';
import MoreButton from '../common/MoreButton';
import FilterChips from '../common/FilterChips';
import { HomeNewPopupSkeleton } from './HomePopupSkeleton';
import NewPopupCard from './NewPopupCard';

const countries = [
  { labelKey: 'place.filters.countries.kr', value: 'KR' },
  { labelKey: 'place.filters.countries.jp', value: 'JP' },
] as const;

type Country = (typeof countries)[number]['value'];

const placeholderImage = require('../../../assets/images/ranking-placeholder.png');
const cardGap = spacing.space12;
const sidePadding = spacing.space16;
const nextCardPreview = 30;

function cardImage(url: string | null): ImageSourcePropType {
  return url ? { uri: url } : placeholderImage;
}

export function displayDate(isoDate: string): string {
  return isoDate.slice(5).replace('-', '.');
}

export function formatPopupPeriod(start: string | null, end: string | null): string {
  const withYear = (date: string) => date.slice(2, 4) + "." + displayDate(date);
  if (!start) return end ? withYear(end) : "";
  if (!end) return withYear(start);
  return (
    withYear(start) +
    " - " +
    (start.slice(0, 4) === end.slice(0, 4) ? displayDate(end) : withYear(end))
  );
}

export default function HomeNewPopupSection({ onPressPopup }: { onPressPopup: (id: string) => void }) {
  const { t, resolvedLanguage } = useTranslation();
  const { themeColors } = useTheme();
  const styles = useMemo(() => ({ ...baseStyles,
    title: { ...baseStyles.title, color: themeColors.textPrimary },
    description: { ...baseStyles.description, color: themeColors.textSecondary },
    stateText: { ...baseStyles.stateText, color: themeColors.textSecondary },
  }), [themeColors]);
  const [selectedCountry, setSelectedCountry] = useState<Country>('KR');
  const { status, popups } = useHomePopups('new', selectedCountry);
  const { isFavorite, isFavoriteDisabled, toggleFavorite, favoritesStatus, retryFavorites } = usePopupFavorites();
  const router = useRouter();
  const availablePopups = popups.filter((popup) => popupOperatingStatus(popup.startDate, popup.endDate) !== '종료');
  const visiblePopups = availablePopups.slice(0, 7);
  const hasMore = availablePopups.length > 7;
  const { width } = useWindowDimensions();
  const cardWidth = (width - sidePadding * 2 - cardGap * 2 - nextCardPreview) / 2;


  return (
    <View style={styles.section}>
      <Text style={styles.title}>{t('home.new.title')}</Text>
      <Text style={styles.description}>{t('home.new.description')}</Text>
      <View style={styles.filters}>
        <FilterChips
          themeColors={themeColors}
          options={countries.map(({ labelKey, value }) => ({ label: t(labelKey), value }))}
          value={selectedCountry}
          onChange={setSelectedCountry}
        />
      </View>
      {favoritesStatus === 'error' && <Pressable accessibilityRole="button" accessibilityLabel={t('home.favoriteRetry')}
        onPress={() => { void retryFavorites(); }}>
        <Text style={styles.stateText}>{t('home.favoriteLoadFailed')}</Text>
      </Pressable>}
      <ScrollView
        key={selectedCountry}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.cardList}
        contentContainerStyle={styles.cardListContent}
      >
        {status === 'loading' && <HomeNewPopupSkeleton width={cardWidth} />}
        {status === 'error' && <Text style={styles.stateText}>{t('home.loadFailed')}</Text>}
        {status === 'ready' && visiblePopups.length === 0 && (
          <Text style={styles.stateText}>{t('home.new.empty')}</Text>
        )}
        {visiblePopups.map((popup) => (
          <NewPopupCard
            key={popup.publicId}
            width={cardWidth}
            image={cardImage(popup.coverImageUrl)}
            isUpcoming={popupOperatingStatus(popup.startDate, popup.endDate) === '오픈 예정'}
            period={formatPopupPeriod(popup.startDate, popup.endDate)}
            title={popup.name}
            tags={[...(popup.regionName ? [getPopupRegionDisplayName(popup, resolvedLanguage)] : []), ...popup.tags.map((tag) => getTagDisplayName(tag, resolvedLanguage))]}
            isFavorite={isFavorite(popup.publicId)}
            isFavoriteDisabled={isFavoriteDisabled(popup.publicId)}
            onToggleFavorite={() => void toggleFavorite(popup)}
            onPress={() => onPressPopup(popup.publicId)}
          />
        ))}
        {hasMore && (
          <View style={{ width: cardWidth, justifyContent: 'center' }}>
            <MoreButton themeColors={themeColors} label={t('home.more')} onPress={() => {
              router.push({ pathname: '/(tabs)/places', params: {
                tab: 'all', countryCode: selectedCountry, ...currentWeekRange(), homeNewEntry: String(Date.now()),
              } });
            }} />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  section: {
    paddingHorizontal: spacing.space16,
  },
  title: {
    ...typography.titleM,
    color: colors.text,
  },
  description: {
    marginTop: 2,
    ...typography.label,
    color: colors.secondaryText,
  },
  filters: {
    marginTop: spacing.space16,
  },
  cardList: {
    marginTop: spacing.space24,
  },
  cardListContent: {
    columnGap: cardGap,
    paddingRight: sidePadding,
  },
  stateText: {
    ...typography.body,
    color: colors.secondaryText,
  },
});
