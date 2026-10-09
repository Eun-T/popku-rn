import { useEffect } from 'react';
import { Animated, StyleSheet, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';

const opacity = new Animated.Value(1);
let mountedBlocks = 0;
let pulse: Animated.CompositeAnimation | undefined;

type SkeletonBlockProps = {
  width: DimensionValue;
  height: DimensionValue;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  backgroundColor?: string;
};

export default function SkeletonBlock({ width, height, borderRadius = 4, style, backgroundColor }: SkeletonBlockProps) {
  useEffect(() => {
    mountedBlocks += 1;
    if (mountedBlocks === 1) {
      pulse = Animated.loop(Animated.sequence([
        Animated.timing(opacity, { toValue: 0.82, duration: 900, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]));
      pulse.start();
    }
    return () => {
      mountedBlocks -= 1;
      if (mountedBlocks === 0) {
        pulse?.stop();
        pulse = undefined;
        opacity.setValue(1);
      }
    };
  }, []);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.block, { width, height, borderRadius, opacity }, backgroundColor && { backgroundColor }, style]}
    />
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: '#F1F3F5' },
});
