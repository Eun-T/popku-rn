import { Stack } from 'expo-router';

export default function ProfileLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="login"
        options={({ route }) => ({
          animation: (route.params as { profileLoginSuccess?: string } | undefined)?.profileLoginSuccess === '1'
            ? 'none'
            : 'default',
        })}
      />
    </Stack>
  );
}
