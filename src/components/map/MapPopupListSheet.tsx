import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import Tag from '../common/Tag';
import type { PopupMapMarker } from '../../lib/popups';
import { popupOperatingStatus } from '../../lib/popupStatus';
import { colors, radius } from '../../theme/tokens';

type MapPopupListSheetProps = {
  popups: readonly PopupMapMarker[];
  bottomPadding: number;
  onPopupPress: (id: string) => void;
  status?: 'loading' | 'ready' | 'error';
  onRetry?: () => void;
};

const placeholderImage = require('../../../assets/images/ranking-placeholder.png');

function monthDay(value: string | null): string | null {
  if (!value) return null;
  const [, month, day] = value.split('-');
  return `${month}.${day}`;
}

function PopupListItem({ popup, onPress }: { popup: PopupMapMarker; onPress: () => void }) {
  const status = popupOperatingStatus(popup.startDate, popup.endDate);
  const period = [monthDay(popup.startDate), monthDay(popup.endDate)]
    .filter(Boolean).join(' ~ ') || '일정 미정';
  const statusColor = status === '운영 중' ? colors.primary
    : status === '오픈 예정' ? colors.infoDark
      : colors.secondaryText;

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.item}>
      <Image
        source={popup.coverImageUrl ? { uri: popup.coverImageUrl } : placeholderImage}
        resizeMode="cover"
        style={styles.image}
      />
      <View style={styles.details}>
        <View style={styles.tags}>
          {(popup.tags ?? []).slice(0, 2).map((tag) => (
            <Tag key={tag.id} label={tag.name} />
          ))}
        </View>
        <Text numberOfLines={2} ellipsizeMode="tail" style={styles.title}>{popup.name}</Text>
        <View style={styles.statusRow}>
          {status && (
            <>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusText, { color: statusColor }]}>{status}</Text>
            </>
          )}
          <Text numberOfLines={1} style={styles.period}>{period}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function MapPopupListSheet({ popups, bottomPadding, onPopupPress, status = 'ready', onRetry }: MapPopupListSheetProps) {
  return (
    <FlatList
      style={styles.list}
      data={popups}
      keyExtractor={(popup) => popup.id}
      renderItem={({ item }) => (
        <PopupListItem popup={item} onPress={() => onPopupPress(item.id)} />
      )}
      contentContainerStyle={[styles.listContent, { paddingBottom: bottomPadding + 16 }]}
      ListEmptyComponent={(
        <View style={styles.emptyState}>
          {status === 'error' ? (
            <Pressable accessibilityRole="button" onPress={onRetry}>
              <Text style={styles.emptyText}>팝업을 불러오지 못했어요. 다시 시도</Text>
            </Pressable>
          ) : (
            <Text style={styles.emptyText}>{status === 'loading' ? '팝업을 불러오는 중이에요' : '이 지역에 해당하는 팝업이 없어요'}</Text>
          )}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
  },
  item: {
    flexDirection: 'row',
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  image: {
    width: 80,
    height: 100,
    borderRadius: radius.radius8,
  },
  details: {
    flex: 1,
    minWidth: 0,
    gap: 8,
  },
  tags: {
    flexDirection: 'row',
    gap: 4,
    overflow: 'hidden',
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
    color: colors.text,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  period: {
    flexShrink: 1,
    color: colors.secondaryText,
    fontSize: 12,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: colors.secondaryText,
    fontSize: 14,
  },
});
