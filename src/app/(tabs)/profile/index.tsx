import { useCallback, useState, useSyncExternalStore } from 'react';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Heart, Star } from 'lucide-react-native';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getAuthUser, refreshAuthUser, logout, subscribeAuthUser } from '../../../lib/auth';
import { colors, radius, spacing, typography } from '../../../theme/tokens';

export default function Profile() {
  const router = useRouter();
  const user = useSyncExternalStore(subscribeAuthUser, getAuthUser, getAuthUser);
  const [loading, setLoading] = useState(true);
  const [restoreFailed, setRestoreFailed] = useState(false);
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
      setRestoreFailed(false);

      async function restoreSession() {
        try {
          await refreshAuthUser(() => active);
        } catch {
          if (active) setRestoreFailed(true);
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
      <ScrollView contentContainerStyle={styles.scrollContent}>
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
        ) : restoreFailed ? (
          <Text style={styles.content}>사용자 정보를 불러오지 못했습니다.</Text>
        ) : (
          <Pressable style={styles.loginButton} onPress={() => router.push('/profile/login')}>
            <Text style={styles.loginButtonText}>로그인</Text>
          </Pressable>
        )}
        {!loading && user && (
          <View style={styles.activitySection}>
            <Text style={styles.activityTitle}>내 활동</Text>
            <View style={styles.activityRow}>
              <Pressable accessibilityRole="button" accessibilityLabel="찜한 팝업 보기" onPress={() => router.push('/profile/favorites' as Href)} style={styles.activityCard}>
                <Heart size={20} color={colors.primaryDark} />
                <Text numberOfLines={1} style={styles.activityLabel}>찜한 팝업</Text>
              </Pressable>
              <View accessibilityRole="button" accessibilityLabel="방문 리뷰, 준비 중" accessibilityState={{ disabled: true }} style={styles.activityCard}>
                <Star size={20} color={colors.secondaryText} />
                <Text numberOfLines={1} style={styles.activityLabel}>방문 리뷰</Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingTop: spacing.space8,
    paddingHorizontal: spacing.space16,
    paddingBottom: spacing.space60 + spacing.space40,
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
  activitySection: { marginTop: spacing.space32 },
  activityTitle: { ...typography.titleS, color: colors.text },
  activityRow: { flexDirection: 'row', gap: spacing.space12, marginTop: spacing.space16 },
  activityCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.space8,
    paddingHorizontal: spacing.space8,
    borderRadius: radius.radius12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  activityLabel: { ...typography.label, color: colors.text, flexShrink: 1 },
});
