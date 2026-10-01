import { BlurView } from 'expo-blur';
import { usePathname } from 'expo-router';
import { Compass, House, Map, MessagesSquare, UserRound, type LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from 'expo-router/tabs';

import { radius, spacing } from '../../theme/tokens';

const icons: Record<string, LucideIcon> = {
  index: House,
  places: Compass,
  map: Map,
  community: MessagesSquare,
  profile: UserRound,
};

export const FLOATING_TAB_BAR_HEIGHT = 64;
export const FLOATING_TAB_BAR_BOTTOM_GAP = spacing.space12;

export default function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();

  if (pathname === '/profile/login' || pathname === '/profile/signup') return null;

  return (
    <View style={[styles.container, { bottom: insets.bottom + FLOATING_TAB_BAR_BOTTOM_GAP }]}>
      <View style={styles.capsule}>
        <BlurView
          intensity={70}
          tint="light"
          blurMethod="dimezisBlurViewSdk31Plus"
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.items}>
          {state.routes.map((route, index) => {
            const Icon = icons[route.name];
            const isSelected = state.index === index;
            const label = descriptors[route.key].options.title ?? route.name;

            return (
              <Pressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityLabel={label}
                accessibilityState={{ selected: isSelected }}
                onPress={() => {
                  const event = navigation.emit({
                    type: 'tabPress',
                    target: route.key,
                    canPreventDefault: true,
                  });
                  if (!isSelected && !event.defaultPrevented) {
                    if (route.name === 'profile') {
                      navigation.navigate('profile', { screen: 'index' });
                    } else {
                      navigation.navigate(route.name);
                    }
                  }
                }}
                style={styles.item}
              >
                <View style={[styles.iconBackground, isSelected && styles.selectedIconBackground]}>
                  <Icon size={24} color="#000000" />
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: spacing.space20,
    right: spacing.space20,
    height: FLOATING_TAB_BAR_HEIGHT,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 8,
  },
  capsule: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.85)',
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
  },
  items: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  item: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBackground: {
    width: 56,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
  selectedIconBackground: {
    backgroundColor: 'rgba(0, 0, 0, 0.09)',
  },
});
