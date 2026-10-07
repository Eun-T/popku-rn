import { MapPin } from 'lucide-react-native';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { PopupSearchResult } from '../../lib/popups';
import type { PlaceAttribution, PlaceSuggestion } from '../../lib/placeSearch';
import { colors, typography } from '../../theme/tokens';

export type PopupSearchState = {
  status: 'idle' | 'loading' | 'success' | 'error';
  results: PopupSearchResult[];
};

export type PlaceSearchState = {
  status: 'idle' | 'loading' | 'success' | 'hidden';
  results: PlaceSuggestion[];
};

export function GooglePlaceAttribution({ providers = [] }: { providers?: PlaceAttribution[] }) {
  return (
    <View style={styles.attributions}>
      <Text style={styles.googleAttribution} numberOfLines={1}>Google Maps</Text>
      {providers.map((provider, index) => (
        <Text
          key={`${provider.provider}-${index}`}
          style={styles.subtitle}
          accessibilityRole={/^https?:\/\//i.test(provider.providerUri) ? 'link' : undefined}
          onPress={/^https?:\/\//i.test(provider.providerUri)
            ? () => { void Linking.openURL(provider.providerUri).catch(() => {}); }
            : undefined}
        >{provider.provider}</Text>
      ))}
    </View>
  );
}

type Props = {
  query: string;
  search: PopupSearchState;
  places: PlaceSearchState;
  resolvingPlaceId: string | null;
  resolveError: string | null;
  maxHeight: number;
  onSelect: (popup: PopupSearchResult) => void;
  onSelectPlace: (place: PlaceSuggestion) => void;
};

export default function MapSearchOverlay({ query, search, places, resolvingPlaceId, resolveError, maxHeight, onSelect, onSelectPlace }: Props) {
  const canSearch = Array.from(query.trim()).length >= 2;
  const showPlaces = places.status === 'loading' || places.results.length > 0;
  const showPopups = search.status === 'loading' || search.status === 'error' || search.results.length > 0;
  const isEmpty = search.status === 'success' && places.status !== 'loading'
    && places.status !== 'idle' && search.results.length === 0 && places.results.length === 0;

  return (
    <ScrollView
      style={[styles.container, { maxHeight }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {canSearch && showPlaces && (
        <View style={styles.placeSection}>
          <Text style={styles.sectionTitle}>장소</Text>
          {places.status === 'loading' && <Text style={styles.message}>검색 중...</Text>}
          {places.results.map((place) => (
            <Pressable
              key={place.placeId}
              accessibilityRole="button"
              accessibilityState={{ disabled: resolvingPlaceId !== null, busy: resolvingPlaceId === place.placeId }}
              disabled={resolvingPlaceId !== null}
              onPress={() => onSelectPlace(place)}
              style={[styles.result, styles.placeRow]}
            >
              <MapPin size={20} color={colors.secondaryText} />
              <View style={styles.placeText}>
                <Text style={styles.name} numberOfLines={1}>{place.title}</Text>
                {!!place.subtitle && <Text style={styles.subtitle} numberOfLines={2}>{place.subtitle}</Text>}
                {resolvingPlaceId === place.placeId && <Text style={styles.subtitle}>위치 확인 중...</Text>}
              </View>
            </Pressable>
          ))}
          {!!resolveError && <Text style={styles.message}>{resolveError}</Text>}
          {places.results.length > 0 && <GooglePlaceAttribution />}
        </View>
      )}
      {canSearch && showPopups && <Text style={styles.sectionTitle}>팝업</Text>}
      {canSearch && search.status === 'loading' && <Text style={styles.message}>검색 중...</Text>}
      {canSearch && search.status === 'error' && <Text style={styles.message}>검색할 수 없어요. 다시 시도해 주세요.</Text>}
      {canSearch && isEmpty && (
        <Text style={styles.message}>검색 결과가 없어요</Text>
      )}
      {canSearch && search.status === 'success' && search.results.map((popup) => (
        <Pressable
          key={popup.id}
          accessibilityRole="button"
          onPress={() => onSelect(popup)}
          style={styles.result}
        >
          <Text style={styles.name} numberOfLines={1}>{popup.name}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {[popup.regionName, popup.address].filter(Boolean).join(' · ')}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  placeSection: { marginBottom: 16 },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  placeText: { flex: 1, gap: 4 },
  attributions: { gap: 4, paddingVertical: 8 },
  googleAttribution: { fontSize: 12, fontWeight: '400', color: '#5E5E5E' },
  container: {
    flexGrow: 0,
    flexShrink: 1,
    backgroundColor: colors.background,
    borderRadius: 16,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.secondaryText,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  result: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 4,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  subtitle: {
    ...typography.caption,
    color: colors.secondaryText,
  },
  message: {
    ...typography.label,
    color: colors.secondaryText,
    paddingVertical: 20,
  },
});
