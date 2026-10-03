import { useCallback, useState, useSyncExternalStore } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getAuthUser, getCurrentUser, getSavedAccessToken, logout, setAuthUser, subscribeAuthUser } from '../../../lib/auth';
import { colors, radius, spacing, typography } from '../../../theme/tokens';

export default function Profile() {
  const router = useRouter();
  const user = useSyncExternalStore(subscribeAuthUser, getAuthUser, getAuthUser);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
    } catch {
      // Local tokens are cleared even when the server request fails.
    } finally {
      setLoggingOut(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);

      async function restoreSession() {
        try {
          const accessToken = await getSavedAccessToken();
          if (__DEV__) console.info('[AUTH] profile restore access token present:', !!accessToken);
          if (accessToken && __DEV__) console.info('[AUTH] /me source: profile restore');
          const currentUser = accessToken ? await getCurrentUser(accessToken) : null;
          if (active) setAuthUser(currentUser);
        } catch {
          if (active) setAuthUser(null);
        } finally {
          if (active) setLoading(false);
        }
      }

      void restoreSession();
      return () => { active = false; };
    }, []),
  );

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>마이페이지</Text>
      {loading ? (
        <ActivityIndicator style={styles.content} color={colors.primary} />
      ) : user ? (
        <View style={styles.content}>
          <Text style={styles.nickname}>{user.nickname}</Text>
          <Text style={styles.email}>{user.email}</Text>
          <Pressable style={styles.logoutButton} onPress={() => void handleLogout()} disabled={loggingOut}>
            <Text style={styles.logoutButtonText}>{loggingOut ? '로그아웃 중...' : '로그아웃'}</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable style={styles.loginButton} onPress={() => router.push('/profile/login')}>
          <Text style={styles.loginButtonText}>로그인</Text>
        </Pressable>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: spacing.space8,
    paddingHorizontal: spacing.space16,
    backgroundColor: colors.background,
  },
  title: { ...typography.titleL, color: colors.text },
  content: { marginTop: spacing.space24, alignItems: 'flex-start' },
  nickname: { ...typography.titleM, color: colors.text },
  email: { ...typography.body, color: colors.secondaryText, marginTop: spacing.space8 },
  logoutButton: { marginTop: spacing.space24, paddingVertical: spacing.space12 },
  logoutButtonText: { ...typography.label, color: colors.secondaryText },
  loginButton: {
    marginTop: spacing.space24,
    paddingVertical: spacing.space12,
    alignItems: 'center',
    borderRadius: radius.radius8,
    backgroundColor: colors.primary,
  },
  loginButtonText: { ...typography.label, color: colors.background },
});
