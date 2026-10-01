import { useState } from 'react';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View, type ImageSourcePropType } from 'react-native';

import { useHomePopups } from '../../hooks/useHomePopups';
import { colors, spacing, typography } from '../../theme/tokens';
import FilterChips from '../common/FilterChips';
import { HomeNewPopupSkeleton } from './HomePopupSkeleton';
import NewPopupCard from './NewPopupCard';

const countries = [
  { label: '한국', value: 'KR' },
  { label: '일본', value: 'JP' },
] as const;

type Country = (typeof countries)[number]['value'];

const placeholderImage = require('../../../assets/images/ranking-placeholder.png');
const cardGap = spacing.space12;
const sidePadding = spacing.space16;
const nextCardPreview = 30;

function cardImage(url: string | null): ImageSourcePropType {
  return url ? { uri: url } : placeholderImage;
}

function displayDate(isoDate: string): string {
  return isoDate.slice(5).replace('-', '.');
}

export default function HomeNewPopupSection() {
  const router = useRouter();
  const [selectedCountry, setSelectedCountry] = useState<Country>('KR');
  const { status, popups } = useHomePopups('new', selectedCountry);
  const { width } = useWindowDimensions();
  const cardWidth = (width - sidePadding * 2 - cardGap * 2 - nextCardPreview) / 2;


  return (
    <View style={styles.section}>
      <Text style={styles.title}>이번 주 새로 열려요 ✨</Text>
      <Text style={styles.description}>이번 주 새롭게 오픈하는 팝업을 만나보세요!</Text>
      <View style={styles.filters}>
        <FilterChips
          options={countries}
          value={selectedCountry}
          onChange={setSelectedCountry}
        />
      </View>
      <ScrollView
        key={selectedCountry}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.cardList}
        contentContainerStyle={styles.cardListContent}
      >
        {status === 'loading' && <HomeNewPopupSkeleton width={cardWidth} />}
        {status === 'error' && <Text style={styles.stateText}>팝업을 불러오지 못했어요.</Text>}
        {status === 'ready' && popups.length === 0 && (
          <Text style={styles.stateText}>이번 주 새로 여는 팝업이 없어요.</Text>
        )}
        {popups.map((popup) => (
          <NewPopupCard
            key={popup.publicId}
            width={cardWidth}
            image={cardImage(popup.coverImageUrl)}
            period={`${displayDate(popup.startDate)} ~ ${displayDate(popup.endDate)}`}
            title={popup.name}
            tags={[...(popup.regionName ? [popup.regionName] : []), ...popup.tags.map((tag) => tag.name)]}
            onPress={() => router.push({ pathname: '/places/[id]', params: { id: popup.publicId } })}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: spacing.space16,
  },
  title: {
    ...typography.titleM,
    color: colors.text,
  },
  description: {
    marginTop: spacing.space8,
    ...typography.label,
    color: colors.secondaryText,
  },
  filters: {
    marginTop: spacing.space20,
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
