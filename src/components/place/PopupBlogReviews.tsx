import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useTranslation } from '../../hooks/useTranslation';
import { getBlogReviews, isBlogPostUrl, type BlogReview } from '../../lib/blogReviews';

export type BlogReviewsHandle = { checkVisibility: () => void };

function displayDescription(value: string): string {
  return value
    .replace(/[\[(](?:(?:사진|이미지)\s*)?출처\s*[:：][^\])]*[\])]/gu, ' ')
    .replace(/(?:https?:\/\/|www\.)[^\s<>]+/giu, url => url.match(/[.,!?。！？，)\]]+$/u)?.[0] ?? ' ')
    .replace(/(^|\s)(?:(?:사진|이미지)\s*)?출처\s*[:：]\s*(?:네이버\s*블로그|네이버|공식\s*홈페이지|공식\s*사이트)(?=\s|$|[.,|·])/gu, '$1')
    .replace(/(^|\s|[（(])#[\p{L}\p{N}_]+/gu, '$1')
    .replace(/(^|\s)(?:(?:사진|이미지)\s*)?출처\s*[:：](?=\s*(?:$|[|·]))/gu, '$1')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,，。.!?])/gu, '$1')
    .replace(/^[\s|·]+|[\s|·]+$/gu, '')
    .replace(/^[\s.,…:;!?()（）\[\]|·-]+$/gu, '')
    .trim()
}

export default forwardRef<BlogReviewsHandle, { publicId: string }>(function PopupBlogReviews({ publicId }, ref) {
  const { t } = useTranslation();
  const { height } = useWindowDimensions();
  const [items, setItems] = useState<BlogReview[] | null>(null);
  const [visibleImages, setVisibleImages] = useState<Set<string>>(new Set());
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const cards = useRef(new Map<string, View>());
  const section = useRef<View>(null);
  const active = useRef(false);
  const generation = useRef(0);
  const requested = useRef(false);
  const loaded = useRef(false);
  const checkVisibility = useCallback(() => {
    if (!active.current) return;
    const currentGeneration = generation.current;
    if (!requested.current && !loaded.current) {
      section.current?.measureInWindow((_x, y, _width, sectionHeight) => {
        if (!active.current || currentGeneration !== generation.current
          || requested.current || loaded.current || sectionHeight <= 0
          || y > height + 300 || y + sectionHeight < -300) return;
        requested.current = true;
        void getBlogReviews(publicId).then(result => {
          if (!active.current || currentGeneration !== generation.current) return;
          loaded.current = true;
          setItems(result);
        });
      });
    }
    cards.current.forEach((card, url) => {
      card.measureInWindow((_x, y, _width, cardHeight) => {
        if (!active.current || currentGeneration !== generation.current
          || cardHeight <= 0 || y >= height || y + cardHeight <= 0) return;
        setVisibleImages(current => current.has(url) ? current : new Set(current).add(url));
      });
    });
  }, [height, publicId]);
  useImperativeHandle(ref, () => ({ checkVisibility }), [checkVisibility]);
  useFocusEffect(useCallback(() => {
    active.current = true;
    requested.current = false;
    checkVisibility();
    return () => { active.current = false; generation.current++; };
  }, [checkVisibility]));
  useEffect(() => { checkVisibility(); }, [items, checkVisibility]);

  // Measure the real document position without reserving an estimated review height.
  // The parent's onContentSizeChange rechecks later sections when this expands or disappears.
  if (items === null) return <View ref={section} collapsable={false} onLayout={checkVisibility} style={{ height: 1 }} />;
  if (!items.length) return null;
  return (
    <View ref={section} collapsable={false} onLayout={checkVisibility} style={styles.section}>
      <Text accessibilityRole="header" style={styles.heading}>{t('place.detail.blogReviews')}</Text>
      <View style={styles.list}>
        {items.map(item => (
          <View key={item.url} collapsable={false}
            ref={node => { if (node) cards.current.set(item.url, node); else cards.current.delete(item.url); }}
            onLayout={checkVisibility}>
            <Pressable accessibilityRole="link" accessibilityLabel={item.title}
              style={styles.card} onPress={() => {
                if (!isBlogPostUrl(item.url)) return;
                void Linking.openURL(item.url).catch(() => Alert.alert(t('place.detail.channelOpenError')));
              }}>
              <View style={styles.text}>
                <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
                {!!displayDescription(item.description) && (
                  <Text style={styles.summary} numberOfLines={2}>{displayDescription(item.description)}</Text>
                )}
                <Text style={styles.date}>{item.publishedAt.replace(/-/g, '.')}</Text>
              </View>
              {item.thumbnailUrl && !failedImages.has(item.thumbnailUrl) && (
                visibleImages.has(item.url) ? (
                  <Image source={{ uri: item.thumbnailUrl }} style={styles.thumbnail} contentFit="cover"
                    cachePolicy="memory-disk" accessible={false}
                    onError={() => setFailedImages(current => new Set(current).add(item.thumbnailUrl!))} />
                ) : <View style={styles.thumbnail} />
              )}
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  section: { marginTop: 24, paddingHorizontal: 16 },
  heading: { fontSize: 20, fontWeight: '700', lineHeight: 28, color: '#111827' },
  list: { marginTop: 20, gap: 12 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16,
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, backgroundColor: '#FFFFFF' },
  text: { flex: 1, minWidth: 0 },
  title: { fontSize: 14, fontWeight: '600', lineHeight: 20, color: '#111827' },
  summary: { marginTop: 4, fontSize: 13, fontWeight: '400', lineHeight: 20, color: '#6B7280' },
  date: { marginTop: 8, fontSize: 12, fontWeight: '400', lineHeight: 18, color: '#6B7280' },
  thumbnail: { width: 80, height: 80, borderRadius: 8, flexShrink: 0 },
});
