import { Heart } from 'lucide-react-native';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { PublicPopup } from '../../lib/popups';
import { colors, radius, spacing } from '../../theme/tokens';

type PlaceWeeklyPopupListProps = {
  popups: readonly PublicPopup[];
  onPressPopup: (popup: PublicPopup) => void;
  isFavorite: (publicId: string) => boolean;
  isFavoriteDisabled: (publicId: string) => boolean;
  onToggleFavorite: (popup: PublicPopup) => void;
};

const placeholderImage = require('../../../assets/images/ranking-placeholder.png');

function formatDate(value: string): string {
  const [, month, day] = value.split('-');
  return `${month}.${day}`;
}

function localDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function PlaceWeeklyPopupList({ popups, onPressPopup, isFavorite, isFavoriteDisabled, onToggleFavorite }: PlaceWeeklyPopupListProps) {
  const todayString = localDateString(new Date());

  return (
    <View style={styles.list}>
      {popups.map((popup, index) => {
        const favorited = isFavorite(popup.publicId);
        const status = popup.startDate > todayString ? '이번 주 오픈' : popup.endDate < todayString ? '종료' : '운영 중';

        return (
          <View key={popup.publicId}>
            <Pressable accessibilityRole="button" accessibilityLabel={popup.name} onPress={() => onPressPopup(popup)} style={styles.card}>
              <Image source={popup.coverImageUrl ? { uri: popup.coverImageUrl } : placeholderImage} resizeMode="cover" style={styles.poster} />
              <View style={styles.information}>
                <View style={styles.titleRow}>
                  <Text numberOfLines={1} ellipsizeMode="tail" style={styles.title}>
                    {popup.name}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={favorited ? '찜 해제' : '찜하기'}
                    accessibilityState={{ selected: favorited, disabled: isFavoriteDisabled(popup.publicId) }}
                    disabled={isFavoriteDisabled(popup.publicId)}
                    onPress={(event) => {
                      event.stopPropagation();
                      onToggleFavorite(popup);
                    }}
                    style={styles.favoriteButton}
                  >
                    <Heart size={18} color={favorited ? colors.primary : colors.text} fill={favorited ? colors.primary : 'none'} style={styles.favoriteIcon} />
                  </Pressable>
                </View>
                <View style={styles.statusRow}>
                  <View style={styles.chip}>
                    <Text style={styles.chipText}>{status}</Text>
                  </View>
                  <Text numberOfLines={1} style={styles.period}>
                    {formatDate(popup.startDate)} - {formatDate(popup.endDate)}
                  </Text>
                </View>
                <View style={styles.tagRow}>
                  <View style={styles.tag}>
                    <Text numberOfLines={1} style={styles.tagText}>{popup.regionName}</Text>
                  </View>
                  {popup.tags[0] && <View style={styles.tag}>
                    <Text numberOfLines={1} style={styles.tagText}>{popup.tags.map((tag) => tag.name).join(', ')}</Text>
                  </View>}
                </View>
              </View>
            </Pressable>
            {index < popups.length - 1 && (
              <View style={styles.separator}><View style={styles.divider} /></View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { marginTop: spacing.space16 },
  card: { height: 112, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background },
  poster: { width: 80, height: 80, borderRadius: radius.radius8 },
  information: { flex: 1, alignSelf: 'center', marginLeft: spacing.space12 },
  titleRow: { height: 36, flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1, fontSize: 15, fontWeight: '700', lineHeight: 20, color: colors.text },
  statusRow: { flexDirection: 'row', alignItems: 'center', columnGap: spacing.space6, marginTop: 4 },
  chip: { height: 22, justifyContent: 'center', paddingHorizontal: spacing.space8, borderRadius: radius.radius4, backgroundColor: colors.primaryLight },
  chipText: { fontSize: 12, fontWeight: '600', lineHeight: 16, color: colors.primaryDark },
  period: { flexShrink: 1, fontSize: 13, lineHeight: 18, color: colors.secondaryText },
  tagRow: { flexDirection: 'row', alignItems: 'center', columnGap: 5, marginTop: 6 },
  tag: { height: 22, flexShrink: 1, justifyContent: 'center', paddingHorizontal: 7, borderRadius: 5, backgroundColor: colors.surface },
  tagText: { fontSize: 11, fontWeight: '500', lineHeight: 16, color: '#4B5563' },
  favoriteButton: { minWidth: 68, height: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', columnGap: spacing.space4 },
  favoriteIcon: { shadowColor: '#000000', shadowOpacity: 0.25, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  separator: { height: 10, justifyContent: 'center' },
  divider: { height: 1, backgroundColor: colors.border, opacity: 0.55 },
});
