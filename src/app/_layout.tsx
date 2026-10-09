import { Stack } from 'expo-router';

import { colors } from '../theme/tokens';
import LanguageProvider from '../locales/LanguageProvider';
import ThemeProvider from '../theme/ThemeProvider';

export default function RootLayout() {
  return (
    <ThemeProvider>
    <LanguageProvider>
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="community/[id]"
        options={{
          presentation: 'card',
          contentStyle: { backgroundColor: colors.background },
        }}
      />
      <Stack.Screen
        name="community/write"
        options={{
          presentation: 'card',
          contentStyle: { backgroundColor: colors.background },
        }}
      />
      <Stack.Screen
        name="reviews/write"
        options={{
          presentation: 'card',
          contentStyle: { backgroundColor: colors.background },
        }}
      />
      <Stack.Screen
        name="reviews/[id]"
        options={{
          presentation: 'card',
          contentStyle: { backgroundColor: colors.background },
        }}
      />
      <Stack.Screen
        name="places/[id]"
        options={{
          presentation: 'card',
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </Stack>
    </LanguageProvider>
    </ThemeProvider>
  );
}
