import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BlurView } from 'expo-blur';
import { usePathname } from 'expo-router';
import { LayoutGrid, MessageCircle, UserRound, type LucideIcon } from 'lucide-react-native';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from 'expo-router/tabs';

import { HouseFilledIcon, MapPinnedFilledIcon, UserRoundFilledIcon } from '../icons/FilledTabIcons';
import { HouseIcon } from '../icons/HouseIcon';
import { MapPinnedIcon } from '../icons/MapPinnedIcon';
import { radius, spacing } from '../../theme/tokens';

const icons: Record<string, LucideIcon> = {
  index: HouseIcon,
  places: LayoutGrid,
  map: MapPinnedIcon,
  community: MessageCircle,
  profile: UserRound,
};

const filledIcons: Record<string, LucideIcon> = {
  index: HouseFilledIcon,
  places: LayoutGrid,
  map: MapPinnedFilledIcon,
  community: MessageCircle,
  profile: UserRoundFilledIcon,
};

export const FLOATING_TAB_BAR_HEIGHT = 60;
export const FLOATING_TAB_BAR_BOTTOM_GAP = spacing.space12;

const INDICATOR_WIDTH = 72;
const ICON_CENTER_SPACING = 68;
const USE_NATIVE_DRIVER = Platform.OS !== 'web';

function TabIcon({ Icon, isSelected, offsetX, fill }: {
  Icon: LucideIcon;
  isSelected: boolean;
  offsetX: number;
  fill: string;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const wasSelected = useRef(isSelected);

  useEffect(() => {
    if (!isSelected) {
      scale.stopAnimation();
      scale.setValue(1);
    } else if (!wasSelected.current) {
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.07, duration: 70, useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.timing(scale, { toValue: 1, duration: 120, useNativeDriver: USE_NATIVE_DRIVER }),
      ]).start();
    }
    wasSelected.current = isSelected;
  }, [isSelected, scale]);

  return (
    <Animated.View style={[styles.iconBackground, { left: offsetX, transform: [{ scale }] }]}>
      <Icon size={24} color="#000000" fill={fill} />
    </Animated.View>
  );
}

export default function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const indicatorX = useRef(new Animated.Value(0)).current;
  const [itemsWidth, setItemsWidth] = useState(0);
  const [tabCenters, setTabCenters] = useState<Record<string, number>>({});
  const hasMeasuredIndicator = useRef(false);
  const [indicatorReady, setIndicatorReady] = useState(false);
  const previousIndex = useRef(state.index);
  const activeRoute = state.routes[state.index];
  const middleIndex = (state.routes.length - 1) / 2;
  const getIconOffset = (routeKey: string, index: number) => {
    const itemCenter = tabCenters[routeKey];
    if (!itemsWidth || itemCenter === undefined) return 0;
    const desiredCenter = itemsWidth / 2 + (index - middleIndex) * ICON_CENTER_SPACING;
    return desiredCenter - itemCenter;
  };
  const selectedItemCenter = activeRoute ? tabCenters[activeRoute.key] : undefined;
  const selectedCenter = activeRoute && itemsWidth > 0 && selectedItemCenter !== undefined
    ? selectedItemCenter + getIconOffset(activeRoute.key, state.index)
    : undefined;

  useLayoutEffect(() => {
    if (selectedCenter === undefined || !activeRoute) return;

    const targetX = selectedCenter - INDICATOR_WIDTH / 2;
    if (!hasMeasuredIndicator.current || previousIndex.current === state.index) {
      indicatorX.setValue(targetX);
      hasMeasuredIndicator.current = true;
      previousIndex.current = state.index;
      setIndicatorReady(true);
      return;
    }

    const animation = Animated.spring(indicatorX, {
      toValue: targetX,
      stiffness: 750,
      damping: 44,
      mass: 0.7,
      useNativeDriver: USE_NATIVE_DRIVER,
    });
    animation.start();
    previousIndex.current = state.index;
    return () => animation.stop();
  }, [indicatorX, selectedCenter, state.index, activeRoute?.key, activeRoute?.name]);

  if (pathname === '/profile/login' || pathname === '/profile/signup') return null;

  return (
    <View style={[styles.container, { bottom: Math.max(insets.bottom - 12, 12) }]}>
      <View style={styles.capsule}>
        <BlurView
          intensity={70}
          tint="light"
          blurMethod="dimezisBlurViewSdk31Plus"
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.items} onLayout={(event) => setItemsWidth(event.nativeEvent.layout.width)}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.indicatorOverlay,
              {
                opacity: indicatorReady && selectedCenter !== undefined ? 1 : 0,
                transform: [{ translateX: indicatorX }],
              },
            ]}
          >
            <View style={styles.indicator} />
          </Animated.View>
          {state.routes.map((route, index) => {
            const isSelected = state.index === index;
            const Icon = isSelected ? filledIcons[route.name] : icons[route.name];
            const fill = isSelected && (route.name === 'places' || route.name === 'community')
              ? '#000000'
              : 'none';
            const label = descriptors[route.key].options.title ?? route.name;

            return (
              <Pressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityLabel={label}
                accessibilityState={{ selected: isSelected }}
                onLayout={(event) => {
                  const { x, width } = event.nativeEvent.layout;
                  const center = x + width / 2;
                  setTabCenters((current) =>
                    current[route.key] === center ? current : { ...current, [route.key]: center },
                  );
                }}
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
                <TabIcon Icon={Icon} isSelected={isSelected} offsetX={getIconOffset(route.key, index)} fill={fill} />
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
    left: 22,
    right: 22,
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
    position: 'relative',
  },
  indicatorOverlay: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    width: INDICATOR_WIDTH,
  },
  indicator: {
    width: INDICATOR_WIDTH,
    height: 50,
    borderRadius: radius.full,
    backgroundColor: 'rgba(0, 0, 0, 0.09)',
  },
  item: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBackground: {
    position: 'relative',
    width: 56,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
});
