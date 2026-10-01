import { Stack, TransitionSpecs, type StackCardInterpolationProps } from 'expo-router/js-stack';

import { colors } from '../theme/tokens';

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="places/[id]"
        options={{
          presentation: 'transparentModal',
          gestureDirection: 'horizontal',
          cardOverlayEnabled: false,
          cardShadowEnabled: false,
          cardStyle: { backgroundColor: colors.background },
          transitionSpec: {
            open: TransitionSpecs.TransitionIOSSpec,
            close: TransitionSpecs.TransitionIOSSpec,
          },
          cardStyleInterpolator: ({ current, layouts }: StackCardInterpolationProps) => ({
            cardStyle: {
              transform: [{
                translateX: current.progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [layouts.screen.width, 0],
                }),
              }],
            },
          }),
        }}
      />
    </Stack>
  );
}
