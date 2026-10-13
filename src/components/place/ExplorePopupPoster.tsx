import { Image, type ImageProps } from 'expo-image';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useHomeCoverImage, type RecoverHomeCover } from '../../hooks/useHomeCoverImage';
import { useTranslation } from '../../hooks/useTranslation';
import type { PublicPopup } from '../../lib/popups';
import { colors, radius, spacing, typography } from '../../theme/tokens';

type Cover = ReturnType<typeof useHomeCoverImage>;
type Props = {
  popup: PublicPopup;
  coverScope?: string;
  onRecoverCover?: RecoverHomeCover;
  style: StyleProp<ViewStyle>;
  contentFit?: 'cover' | 'contain';
  renderBackground?: (cover: Cover) => ReactNode;
  imageEvents?: Pick<ImageProps, 'onLoadStart' | 'onLoad' | 'onLoadEnd' | 'onDisplay' | 'onError'>;
};
const placeholder = require('../../../assets/images/ranking-placeholder.png');

/** One hook owns both carousel layers; the list owns only the updated cover fields. */
export default function ExplorePopupPoster({ popup, coverScope, onRecoverCover, style,
  contentFit = 'cover', renderBackground, imageEvents }: Props) {
  const { t } = useTranslation();
  // A removed URL cannot retain a previously loaded poster through its old cache key.
  const coverItem = popup.coverImageUrl ? popup : { ...popup, coverImageCacheKey: null };
  const cover = useHomeCoverImage(placeholder, coverItem, onRecoverCover, coverScope);
  return <>
    {renderBackground?.(cover)}
    <View style={[style, styles.poster]}>
      <Image key={cover.imageKey} source={cover.source} style={StyleSheet.absoluteFill}
        contentFit={contentFit} cachePolicy="memory-disk" {...imageEvents}
        onError={event => { imageEvents?.onError?.(event); cover.onError(); }}
        onLoad={event => { imageEvents?.onLoad?.(event); cover.onLoad(); }} />
      {cover.canRetry && <Pressable testID="explore-cover-retry" accessibilityRole="button"
        accessibilityLabel={t('home.card.retryImage', { title: popup.name })}
        accessibilityState={{ disabled: cover.busy }} disabled={cover.busy}
        onPress={event => { event.stopPropagation(); cover.retry(); }} style={styles.retry}>
        <Text style={styles.retryText}>{t('home.card.retry')}</Text>
      </Pressable>}
    </View>
  </>;
}
const styles = StyleSheet.create({
  poster: { overflow: 'hidden' },
  retry: { position: 'absolute', left: spacing.space8, top: spacing.space8,
    paddingHorizontal: spacing.space8, paddingVertical: spacing.space6,
    borderRadius: radius.radius4, backgroundColor: colors.background },
  retryText: { ...typography.caption, color: colors.text },
});
