import { Search } from 'lucide-react-native';
import { StyleSheet, TextInput, View } from 'react-native';
import MapView, { PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, typography } from '../theme/tokens';

const initialRegion = {
  latitude: 37.5445,
  longitude: 127.0560,
  latitudeDelta: 0.025,
  longitudeDelta: 0.025,
};

export default function MapScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={initialRegion}
        scrollEnabled
        zoomEnabled
      />
      <View style={[styles.searchBar, { top: insets.top + 12 }]}>
        <Search size={20} color={colors.secondaryText} />
        <TextInput
          style={styles.searchInput}
          placeholder="장소나 팝업을 검색해보세요"
          placeholderTextColor={colors.secondaryText}
          returnKeyType="search"
          underlineColorAndroid="transparent"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
    width: '100%',
  },
  searchBar: {
    position: 'absolute',
    left: 20,
    right: 20,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: colors.background,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 0,
    ...typography.label,
    color: colors.text,
  },
});
