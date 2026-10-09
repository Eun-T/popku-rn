import { BlurView } from "expo-blur";
import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from "expo-glass-effect";
import { usePathname } from "expo-router";
import type { BottomTabBarProps } from "expo-router/tabs";
import {
  LayoutGrid,
  MessageCircle,
  UserRound,
  type LucideIcon,
} from "lucide-react-native";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Easing,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { radius, spacing } from "../../theme/tokens";
import {
  HouseFilledIcon,
  MapPinnedFilledIcon,
  UserRoundFilledIcon,
} from "../icons/FilledTabIcons";
import { HouseIcon } from "../icons/HouseIcon";
import { MapPinnedIcon } from "../icons/MapPinnedIcon";

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
const USE_NATIVE_DRIVER = Platform.OS !== "web";

function TabIcon({
  Icon,
  isSelected,
  offsetX,
  fill,
}: {
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
        Animated.timing(scale, {
          toValue: 1.07,
          duration: 70,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 120,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]).start();
    }
    wasSelected.current = isSelected;
  }, [isSelected, scale]);

  return (
    <Animated.View
      style={[styles.iconBackground, { left: offsetX, transform: [{ scale }] }]}
    >
      <Icon size={24} color="#000000" fill={fill} />
    </Animated.View>
  );
}

export default function FloatingTabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const useLiquidGlass =
    Platform.OS === "ios" &&
    isLiquidGlassAvailable() &&
    isGlassEffectAPIAvailable();
  const indicatorX = useRef(new Animated.Value(0)).current;
  const barScale = useRef(new Animated.Value(1)).current;
  const indicatorScale = useRef(new Animated.Value(1)).current;
  const currentBarScale = useRef(1);
  const itemsRef = useRef<View>(null);
  const itemsPageX = useRef<number | null>(null);
  const dragging = useRef(false);
  const pendingIndex = useRef<number | null>(null);
  const suppressPress = useRef(false);
  const [itemsWidth, setItemsWidth] = useState(0);
  const [tabCenters, setTabCenters] = useState<Record<string, number>>({});
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const hasMeasuredIndicator = useRef(false);
  const [indicatorReady, setIndicatorReady] = useState(false);
  const previousIndex = useRef(state.index);
  const activeRoute = state.routes[state.index];
  const middleIndex = (state.routes.length - 1) / 2;
  useEffect(() => {
    const listener = barScale.addListener(({ value }) => {
      currentBarScale.current = value;
    });
    return () => barScale.removeListener(listener);
  }, [barScale]);
  const animateDragScale = useCallback(
    (isDragging: boolean) => {
      Animated.parallel([
        Animated.timing(barScale, {
          toValue: isDragging ? 1.03 : 1,
          duration: isDragging ? 110 : 130,
          easing: Easing.out(Easing.quad),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(indicatorScale, {
          toValue: isDragging ? 1.08 : 1,
          duration: isDragging ? 110 : 130,
          easing: Easing.out(Easing.quad),
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ]).start();
    },
    [barScale, indicatorScale],
  );
  const localXForPageX = useCallback(
    (pageX: number) =>
      itemsWidth / 2 +
      (pageX - itemsPageX.current! - itemsWidth / 2) / currentBarScale.current,
    [itemsWidth],
  );
  const centerForIndex = useCallback(
    (index: number) =>
      itemsWidth / 2 + (index - middleIndex) * ICON_CENTER_SPACING,
    [itemsWidth, middleIndex],
  );
  const clampIndicatorX = useCallback(
    (x: number) => Math.max(0, Math.min(x, itemsWidth - INDICATOR_WIDTH)),
    [itemsWidth],
  );
  const nearestIndex = useCallback(
    (x: number) => {
      let nearest = 0;
      for (let index = 1; index < state.routes.length; index += 1) {
        if (
          Math.abs(centerForIndex(index) - x) <
          Math.abs(centerForIndex(nearest) - x)
        ) {
          nearest = index;
        }
      }
      return nearest;
    },
    [centerForIndex, state.routes.length],
  );
  const snapToIndex = useCallback(
    (index: number) => {
      Animated.spring(indicatorX, {
        toValue: clampIndicatorX(centerForIndex(index) - INDICATOR_WIDTH / 2),
        stiffness: 750,
        damping: 44,
        mass: 0.7,
        useNativeDriver: USE_NATIVE_DRIVER,
      }).start();
    },
    [centerForIndex, clampIndicatorX, indicatorX],
  );
  const navigateToIndex = useCallback(
    (index: number) => {
      const route = state.routes[index];
      const event = navigation.emit({
        type: "tabPress",
        target: route.key,
        canPreventDefault: true,
      });
      if (index === state.index || event.defaultPrevented) return false;

      if (route.name === "profile") {
        navigation.navigate("profile", { screen: "index" });
      } else {
        navigation.navigate(route.name);
      }
      return true;
    },
    [navigation, state.index, state.routes],
  );
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, gesture) =>
          itemsPageX.current !== null &&
          itemsWidth > 0 &&
          Math.abs(gesture.dx) > 6 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderGrant: (_, gesture) => {
          dragging.current = true;
          suppressPress.current = true;
          indicatorX.stopAnimation();
          animateDragScale(true);
          const x = localXForPageX(gesture.moveX);
          indicatorX.setValue(clampIndicatorX(x - INDICATOR_WIDTH / 2));
          setPreviewIndex(nearestIndex(x));
        },
        onPanResponderMove: (_, gesture) => {
          const x = localXForPageX(gesture.moveX);
          indicatorX.setValue(clampIndicatorX(x - INDICATOR_WIDTH / 2));
          setPreviewIndex((current) => {
            const next = nearestIndex(x);
            return current === next ? current : next;
          });
        },
        onPanResponderRelease: (_, gesture) => {
          const index = nearestIndex(localXForPageX(gesture.moveX));
          dragging.current = false;
          animateDragScale(false);
          snapToIndex(index);
          pendingIndex.current = index;
          setPreviewIndex(index);
          if (!navigateToIndex(index)) {
            pendingIndex.current = null;
            setPreviewIndex(null);
          }
        },
        onPanResponderTerminate: () => {
          dragging.current = false;
          animateDragScale(false);
          pendingIndex.current = null;
          setPreviewIndex(null);
          snapToIndex(state.index);
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [
      itemsWidth,
      indicatorX,
      animateDragScale,
      localXForPageX,
      clampIndicatorX,
      nearestIndex,
      navigateToIndex,
      snapToIndex,
      state.index,
    ],
  );
  useEffect(() => {
    if (pendingIndex.current === state.index) {
      pendingIndex.current = null;
      setPreviewIndex(null);
    }
  }, [state.index]);
  const getIconOffset = (routeKey: string, index: number) => {
    const itemCenter = tabCenters[routeKey];
    if (!itemsWidth || itemCenter === undefined) return 0;
    const desiredCenter =
      itemsWidth / 2 + (index - middleIndex) * ICON_CENTER_SPACING;
    return desiredCenter - itemCenter;
  };
  const selectedItemCenter = activeRoute
    ? tabCenters[activeRoute.key]
    : undefined;
  const selectedCenter =
    activeRoute && itemsWidth > 0 && selectedItemCenter !== undefined
      ? selectedItemCenter + getIconOffset(activeRoute.key, state.index)
      : undefined;

  useLayoutEffect(() => {
    if (
      selectedCenter === undefined ||
      !activeRoute ||
      dragging.current ||
      pendingIndex.current !== null
    )
      return;

    const targetX = selectedCenter - INDICATOR_WIDTH / 2;
    if (
      !hasMeasuredIndicator.current ||
      previousIndex.current === state.index
    ) {
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
  }, [
    indicatorX,
    selectedCenter,
    state.index,
    activeRoute?.key,
    activeRoute?.name,
  ]);
  const barReady = indicatorReady && selectedCenter !== undefined;

  if (pathname === "/profile/login" || pathname === "/profile/signup")
    return null;

  return (
    <View
      pointerEvents={barReady ? "auto" : "none"}
      style={[
        styles.container,
        { bottom: Math.max(insets.bottom - 12, 12) },
      ]}
    >
      <Animated.View
        style={[styles.capsule, { transform: [{ scale: barScale }] }]}
      >
        {useLiquidGlass ? (
          <GlassView
            glassEffectStyle="regular"
            tintColor="rgba(0, 0, 0, 0.06)"
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, styles.glassBackground]}
          />
        ) : (
          <BlurView
            intensity={15}
            tint="light"
            blurMethod="dimezisBlurViewSdk31Plus"
            style={StyleSheet.absoluteFill}
          />
        )}
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.glassTint]}
        />
        {/* Keep opacity off GlassView ancestors; reveal only the foreground together. */}
        <View
          ref={itemsRef}
          style={[styles.items, { opacity: barReady ? 1 : 0 }]}
          onLayout={(event) => {
            setItemsWidth(event.nativeEvent.layout.width);
            itemsRef.current?.measureInWindow((x) => {
              itemsPageX.current = x;
            });
          }}
          {...panResponder.panHandlers}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              styles.indicatorOverlay,
              {
                opacity: barReady ? 1 : 0,
                transform: [{ translateX: indicatorX }],
              },
            ]}
          >
            <Animated.View
              style={[
                styles.indicator,
                { transform: [{ scale: indicatorScale }] },
              ]}
            />
          </Animated.View>
          {state.routes.map((route, index) => {
            const isSelected = (previewIndex ?? state.index) === index;
            const Icon = isSelected
              ? filledIcons[route.name]
              : icons[route.name];
            const fill =
              isSelected &&
              (route.name === "places" || route.name === "community")
                ? "#000000"
                : "none";
            const label = descriptors[route.key].options.title ?? route.name;

            return (
              <Pressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityLabel={label}
                accessibilityState={{ selected: isSelected }}
                onPressIn={() => {
                  suppressPress.current = false;
                }}
                onLayout={(event) => {
                  const { x, width } = event.nativeEvent.layout;
                  const center = x + width / 2;
                  setTabCenters((current) =>
                    current[route.key] === center
                      ? current
                      : { ...current, [route.key]: center },
                  );
                }}
                onPress={() => {
                  if (!suppressPress.current) navigateToIndex(index);
                }}
                style={styles.item}
              >
                <TabIcon
                  Icon={Icon}
                  isSelected={isSelected}
                  offsetX={getIconOffset(route.key, index)}
                  fill={fill}
                />
              </Pressable>
            );
          })}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 22,
    right: 22,
    height: FLOATING_TAB_BAR_HEIGHT,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.09,
    shadowRadius: 18,
    elevation: 6,
  },
  capsule: {
    flex: 1,
    overflow: "hidden",
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.42)",
    borderTopColor: "rgba(255, 255, 255, 0.58)",
    backgroundColor: "transparent",
  },
  glassTint: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  glassBackground: {
    borderRadius: radius.full,
  },
  items: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    position: "relative",
  },
  indicatorOverlay: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    width: INDICATOR_WIDTH,
  },
  indicator: {
    width: INDICATOR_WIDTH,
    height: 50,
    borderRadius: radius.full,
    backgroundColor: "rgba(0, 0, 0, 0.09)",
  },
  item: {
    flex: 1,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  iconBackground: {
    position: "relative",
    width: 56,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.full,
  },
});
