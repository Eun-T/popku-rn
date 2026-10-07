import { Stack } from 'expo-router/js-stack';

import { colors } from '../theme/tokens';

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="community/[id]"
        options={{
          presentation: 'card',
          cardStyle: { backgroundColor: colors.background },
        }}
      />
      <Stack.Screen
        name="community/write"
        options={{
          presentation: 'card',
          cardStyle: { backgroundColor: colors.background },
        }}
      />
      <Stack.Screen
        name="reviews/write"
        options={{
          presentation: 'card',
          cardStyle: { backgroundColor: colors.background },
        }}
      />
      <Stack.Screen
        name="reviews/[id]"
        options={{
          presentation: 'card',
          cardStyle: { backgroundColor: colors.background },
        }}
      />
      <Stack.Screen
        name="places/[id]"
        options={{
          presentation: 'card',
          cardStyle: { backgroundColor: colors.background },
        }}
      />
    </Stack>
  );
}
