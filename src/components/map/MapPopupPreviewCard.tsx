import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import Tag from '../common/Tag';
import type { PopupMapMarker } from '../../lib/popups';
import { popupOperatingStatus } from '../../lib/popupStatus';
import { colors, radius } from '../../theme/tokens';

type MapPopupPreviewCardProps = {
  popup: PopupMapMarker;
  onPress: () => void;
  bottomInset: number;
};

const placeholderImage = require('../../../assets/images/ranking-placeholder.png');
const placeholderSize = Image.resolveAssetSource(placeholderImage);
const placeholderAspectRatio = placeholderSize.width / placeholderSize.height;
const imageAspectRatios = new Map<string, number>();

function monthDay(value: string | null): string | null {
  if (!value) return null;
  const [, month, day] = value.split('-');
  return `${month}.${day}`;
}

export default function MapPopupPreviewCard({ popup, onPress, bottomInset }: MapPopupPreviewCardProps) {
  const [imageSize, setImageSize] = useState<{ uri: string; aspectRatio: number } | null>(null);
  const imageUri = popup.coverImageUrl;

  useEffect(() => {
    if (!imageUri) return;
    const cachedRatio = imageAspectRatios.get(imageUri);
    if (cachedRatio) {
      setImageSize({ uri: imageUri, aspectRatio: cachedRatio });
      return;
    }

    let cancelled = false;
    Image.getSize(
      imageUri,
      (width, height) => {
        if (cancelled) return;
        const aspectRatio = width > 0 && height > 0 ? width / height : placeholderAspectRatio;
        imageAspectRatios.set(imageUri, aspectRatio);
        setImageSize({ uri: imageUri, aspectRatio });
      },
      () => {
        if (!cancelled) setImageSize({ uri: imageUri, aspectRatio: placeholderAspectRatio });
      },
    );
    return () => { cancelled = true; };
  }, [imageUri]);

  const aspectRatio = imageUri && imageSize?.uri === imageUri
    ? imageSize.aspectRatio : placeholderAspectRatio;
  const status = popupOperatingStatus(popup.startDate, popup.endDate);
  const period = [monthDay(popup.startDate), monthDay(popup.endDate)]
    .filter(Boolean).join(' ~ ') || '일정 미정';
  const statusColor = status === '운영 중' ? colors.primary
    : status === '오픈 예정' ? colors.infoDark
      : colors.secondaryText;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.card, { paddingBottom: 16 + bottomInset }]}
    >
      <Image
        source={popup.coverImageUrl ? { uri: popup.coverImageUrl } : placeholderImage}
        resizeMode="contain"
        style={[styles.image, { aspectRatio }]}
      />
      <View style={styles.content}>
        <Text numberOfLines={2} ellipsizeMode="tail" style={styles.title}>
          {popup.name}
        </Text>
        <View style={styles.statusRow}>
          {status && (
            <>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusText, { color: statusColor }]}>{status}</Text>
            </>
          )}
          <Text numberOfLines={1} style={styles.period}>{period}</Text>
        </View>
        <View style={styles.tags}>
          {(popup.tags ?? []).slice(0, 2).map((tag) => (
            <Tag key={tag.id} label={tag.name} />
          ))}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  image: {
    width: 84,
    borderRadius: radius.radius8,
  },
  content: {
    flex: 1,
    minWidth: 0,
    gap: 8,
  },
  title: {
    fontSize: 16,
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
  tags: {
    flexDirection: 'row',
    gap: 4,
    overflow: 'hidden',
    height: 24,
  },
});
