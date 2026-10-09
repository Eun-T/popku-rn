import { useTranslation } from '../../hooks/useTranslation';
import { accountUiText } from '../../locales/accountUi';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { clearTokens, getAuthUser, subscribeAuthUser, withdrawAccount } from '../../lib/auth';
import { colors, radius, spacing, typography } from '../../theme/tokens';

const notices = [
  '질문/자유 게시글과 해당 글에 달린 댓글은 삭제됩니다.',
  '관심 팝업과 좋아요 등 개인 활동 정보가 삭제됩니다.',
  "방문 리뷰와 일부 댓글은 삭제되지 않고 '탈퇴한 사용자'로 표시되어 유지됩니다.",
  '삭제된 정보는 복구할 수 없습니다.',
];

export default function Withdrawal() {
  const { t } = useTranslation();
  const accountTranslation = useRef(t);
  useEffect(() => { accountTranslation.current = t; }, [t]);
  const router = useRouter();
  const user = useSyncExternalStore(subscribeAuthUser, getAuthUser, getAuthUser);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const confirmingRef = useRef(false);
  const deletedGenerationRef = useRef<number | null>(null);

  useEffect(() => {
    if (!user && !pendingRef.current && deletedGenerationRef.current === null) router.dismissTo('/profile');
  }, [user, router]);

  async function handleWithdraw() {
    if (pendingRef.current || (!getAuthUser() && deletedGenerationRef.current === null)) return;
    pendingRef.current = true;
    setPending(true);
    try {
      if (deletedGenerationRef.current === null) deletedGenerationRef.current = await withdrawAccount();
      try {
        await clearTokens(deletedGenerationRef.current);
      } catch (error) {
        // clearTokens advanced this generation before attempting storage deletion.
        // Retry local cleanup only; never repeat an already-successful DELETE.
        deletedGenerationRef.current += 1;
        throw error;
      }
      router.dismissTo('/profile');
    } catch {
      if (deletedGenerationRef.current !== null) {
        Alert.alert(accountUiText(accountTranslation.current, "회원탈퇴가 완료되었습니다"), accountUiText(accountTranslation.current, "기기의 로그인 정보를 정리하지 못했습니다. 다시 시도해주세요."));
      } else {
        Alert.alert(accountUiText(accountTranslation.current, "회원탈퇴"), accountUiText(accountTranslation.current, "회원탈퇴에 실패했습니다. 다시 시도해주세요."));
      }
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  function confirmWithdrawal() {
    if (pendingRef.current || confirmingRef.current) return;
    if (deletedGenerationRef.current !== null) { void handleWithdraw(); return; }
    if (!getAuthUser()) { router.dismissTo('/profile'); return; }
    confirmingRef.current = true;
    Alert.alert(accountUiText(accountTranslation.current, "정말 탈퇴하시겠어요?"), accountUiText(accountTranslation.current, "탈퇴하면 삭제되는 정보는 복구할 수 없습니다."), [
      { text: accountUiText(accountTranslation.current, "취소"), style: 'cancel', onPress: () => { confirmingRef.current = false; } },
      { text: accountUiText(accountTranslation.current, "탈퇴하기"), style: 'destructive', onPress: () => { confirmingRef.current = false; void handleWithdraw(); } },
    ], { cancelable: true, onDismiss: () => { confirmingRef.current = false; } });
  }

  if (!user && deletedGenerationRef.current === null) return null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={accountUiText(t, "뒤로가기")} disabled={pending || deletedGenerationRef.current !== null}
          onPress={() => router.canGoBack() ? router.back() : router.replace('/profile')} style={styles.backButton}>
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{accountUiText(t, "회원탈퇴")}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View>
          <Text style={styles.title}>{accountUiText(t, "회원탈퇴")}</Text>
          <Text style={styles.description}>{accountUiText(t, "탈퇴하기 전에 확인해주세요.")}</Text>
          <View style={styles.notices}>
            {notices.map((notice) => (
              <View key={notice} style={styles.notice}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.noticeText}>{accountUiText(t, notice)}</Text>
              </View>
            ))}
          </View>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={deletedGenerationRef.current === null ? accountUiText(t, "회원탈퇴") : accountUiText(t, "로그인 정보 정리")}
          accessibilityState={{ disabled: pending, busy: pending }} disabled={pending} onPress={confirmWithdrawal}
          style={[styles.submit, pending && styles.disabled]}>
          {pending ? <ActivityIndicator accessibilityLabel={accountUiText(t, "회원탈퇴 처리 중")} color={colors.background} />
            : <Text style={styles.submitText}>{deletedGenerationRef.current === null ? accountUiText(t, "회원탈퇴") : accountUiText(t, "로그인 정보 정리")}</Text>}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { minHeight: spacing.space56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.space16 },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { ...typography.titleM, color: colors.text, marginLeft: spacing.space8 },
  content: { flexGrow: 1, justifyContent: 'space-between', paddingHorizontal: spacing.space16,
    paddingTop: spacing.space24, paddingBottom: spacing.space60 + spacing.space40 },
  title: { ...typography.titleL, color: colors.text },
  description: { ...typography.body, color: colors.text, marginTop: spacing.space16 },
  notices: { marginTop: spacing.space24, gap: spacing.space16 },
  notice: { flexDirection: 'row', gap: spacing.space8 },
  bullet: { ...typography.body, color: colors.secondaryText },
  noticeText: { ...typography.body, color: colors.secondaryText, flex: 1 },
  submit: { marginTop: spacing.space40, minHeight: spacing.space24 * 2, paddingVertical: spacing.space12,
    paddingHorizontal: spacing.space16, alignItems: 'center', justifyContent: 'center', borderRadius: radius.radius8, backgroundColor: colors.primary },
  submitText: { ...typography.label, color: colors.background },
  disabled: { opacity: 0.5 },
});
