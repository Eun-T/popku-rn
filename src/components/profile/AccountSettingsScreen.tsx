import { accountUiKey, accountUiText } from '../../locales/accountUi';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { ChevronLeft, Eye, EyeOff } from 'lucide-react-native';
import { ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { clearTokens, getAuthUser, subscribeAuthSession, subscribeAuthUser } from '../../lib/auth';
import { AccountSettingsError, accountSettingsErrorMessage, changeMyPassword, updateMyNickname } from '../../lib/accountSettings';
import { isValidNickname, normalizeNickname, passwordChangeError } from '../../lib/accountPolicy';
import { checkNicknameAvailability } from '../../lib/nicknameAvailability';
import { colors, radius, spacing, typography } from '../../theme/tokens';

import { useTranslation } from '../../hooks/useTranslation';

// Keys for fixed messages returned by the existing app error mapper, never server text.
const nicknameErrorKeys: Record<string, string> = {
  "로그인이 만료됐어요. 다시 로그인해 주세요.": "profile.nickname.sessionExpired",
  "이미 사용 중인 닉네임이에요.": "profile.nickname.taken",
  "현재 비밀번호가 일치하지 않아요.": "profile.nickname.passwordIncorrect",
  "새 비밀번호와 확인값이 일치하지 않아요.": "profile.nickname.passwordMismatch",
  "현재 비밀번호와 다른 비밀번호를 입력해 주세요.": "profile.nickname.passwordSame",
  "소셜 로그인 계정은 비밀번호를 변경할 수 없어요.": "profile.nickname.socialForbidden",
  "입력값과 형식을 확인해 주세요.": "profile.nickname.inputInvalid",
  "저장하지 못했어요. 네트워크 연결을 확인하고 다시 시도해 주세요.": "profile.nickname.saveFailed"
};

type Props = { kind: 'nickname' | 'password' };
type PasswordFieldProps = { label: string; value: string; onChange: (value: string) => void; pending: boolean; current?: boolean };

function PasswordField({ label, value, onChange, pending, current }: PasswordFieldProps) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.passwordRow}>
      <TextInput accessibilityLabel={label} style={styles.passwordInput} placeholder={label}
        placeholderTextColor={colors.secondaryText} value={value} onChangeText={onChange}
        secureTextEntry={!visible} autoCapitalize="none" autoCorrect={false} editable={!pending}
        autoComplete={current ? 'current-password' : 'new-password'} />
      <Pressable accessibilityRole="button" accessibilityLabel={`${label} ${visible ? accountUiText(t, "숨기기") : accountUiText(t, "표시")}`}
        onPress={() => setVisible(value => !value)} style={styles.eyeButton}>
        {visible ? <EyeOff size={20} color={colors.secondaryText} /> : <Eye size={20} color={colors.secondaryText} />}
      </Pressable>
    </View>
  </View>;
}

export default function AccountSettingsScreen({ kind }: Props) {
  const { t } = useTranslation();
  const accountTranslation = useRef(t);
  useEffect(() => { accountTranslation.current = t; }, [t]);
  const router = useRouter();
  const user = useSyncExternalStore(subscribeAuthUser, getAuthUser, getAuthUser);
  const title = kind === 'nickname' ? t('profile.nickname.title') : accountUiText(t, '비밀번호 변경');
  const [nickname, setNickname] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const request = useRef<AbortController | null>(null);
  const active = useRef(false);
  const clearPasswords = useCallback(() => {
    setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
  }, []);

  useFocusEffect(useCallback(() => {
    active.current = true;
    setPending(false);
    clearPasswords();
    return () => {
      active.current = false;
      request.current?.abort(); request.current = null;
      clearPasswords();
    };
  }, [clearPasswords]));
  useEffect(() => subscribeAuthSession(() => {
    request.current?.abort(); request.current = null;
    clearPasswords(); setNickname(''); setPending(false); setError('');
  }), [clearPasswords]);

  async function save() {
    if (request.current || !active.current || !getAuthUser()) return;
    setError(''); setSuccess('');
    const normalized = normalizeNickname(nickname);
    if (kind === 'nickname') {
      if (!isValidNickname(normalized)) { setError(accountUiKey('profile.nickname.invalid')); return; }
      if (normalized === getAuthUser()?.nickname) { setSuccess(accountUiKey('profile.nickname.unchanged')); return; }
    } else {
      if (getAuthUser()?.provider !== 'LOCAL') return;
      const message = passwordChangeError(currentPassword, newPassword, confirmPassword);
      if (message) { setError(accountUiKey(message)); return; }
    }
    const controller = new AbortController(); request.current = controller;
    setPending(true); Keyboard.dismiss();
    try {
      if (kind === 'nickname') {
        const available = await checkNicknameAvailability(normalized, controller.signal);
        if (controller.signal.aborted) return;
        if (!available) { setError(accountUiKey('profile.nickname.taken')); return; }
        await updateMyNickname(normalized, controller.signal);
        if (!controller.signal.aborted) { setNickname(''); setSuccess(accountUiKey('profile.nickname.changed')); }
      } else {
        const generation = await changeMyPassword(currentPassword, newPassword, confirmPassword, controller.signal);
        if (active.current) {
          clearPasswords();
        }
        // Clear only the requesting session, even if a new login began during the PATCH.
        let cleared = false;
        try { cleared = await clearTokens(generation); }
        catch {
          if (active.current) {
            setSuccess(accountUiKey('비밀번호가 변경됐어요.'));
            setError(accountUiKey('앱 인증 정보 정리에 실패했어요. 앱을 다시 열고 로그인해 주세요.'));
          }
        }
        if (active.current && cleared) {
          setSuccess(accountUiKey('비밀번호가 변경됐어요. 다시 로그인해 주세요.'));
          Alert.alert(accountUiText(accountTranslation.current, "비밀번호 변경"), accountUiText(accountTranslation.current, "비밀번호가 변경됐어요. 다시 로그인해 주세요."),
            [{ text: accountUiText(accountTranslation.current, "확인"), onPress: () => router.dismissTo('/profile/login') }]);
        }
      }
    } catch (failure) {
      if (controller.signal.aborted) return;
      const message = accountSettingsErrorMessage(failure, kind);
      setError(accountUiKey(kind === 'nickname' ? (nicknameErrorKeys[message] ?? message) : message));
      if (failure instanceof AccountSettingsError && failure.status === 401) {
        try { await clearTokens(failure.authGeneration); } catch { /* Keep the visible error if storage cleanup fails. */ }
      }
    } finally {
      if (active.current && request.current === controller) { request.current = null; setPending(false); }
    }
  }

  const allowed = user && (kind === 'nickname' || user.provider === 'LOCAL');
  return <SafeAreaView style={styles.container}>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel={kind === 'nickname' ? t('language.back') : accountUiText(t, "뒤로가기")} disabled={pending} style={styles.backButton}
        onPress={() => router.canGoBack() ? router.back() : router.replace('/profile/settings' as Href)}>
        <ChevronLeft size={24} color={colors.text} />
      </Pressable>
      <Text style={styles.headerTitle}>{accountUiText(t, title)}</Text>
    </View>
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.content}>
        {allowed ? <>
          {kind === 'nickname' ? <>
            <Text style={styles.label}>{t('profile.nickname.current')}</Text>
            <Text style={styles.currentNickname}>{user.nickname}</Text>
            <View style={styles.field}>
              <Text style={styles.label}>{t('profile.nickname.new')}</Text>
              <TextInput accessibilityLabel={t('profile.nickname.new')} style={styles.input} placeholder={t('profile.nickname.new')}
                placeholderTextColor={colors.secondaryText} value={nickname} onChangeText={value => { setNickname(value); setError(''); setSuccess(''); }}
                autoCapitalize="none" autoCorrect={false} editable={!pending} />
              <Text style={styles.hint}>{t('profile.nickname.hint')}</Text>
            </View>
          </> : <>
            <PasswordField label={accountUiText(t, "현재 비밀번호")} value={currentPassword} onChange={setCurrentPassword} pending={pending} current />
            <PasswordField label={accountUiText(t, "새 비밀번호")} value={newPassword} onChange={setNewPassword} pending={pending} />
            <Text style={styles.hint}>{accountUiText(t, "영문과 숫자를 포함한 8~72자. 공백 없이 영문·숫자·기호를 사용할 수 있어요.")}</Text>
            <PasswordField label={accountUiText(t, "새 비밀번호 확인")} value={confirmPassword} onChange={setConfirmPassword} pending={pending} />
          </>}
          <Pressable accessibilityRole="button" accessibilityLabel={kind === 'nickname' ? t('profile.nickname.save') : accountUiText(t, "저장")} accessibilityState={{ disabled: pending, busy: pending }}
            disabled={pending} onPress={() => { void save(); }} style={[styles.saveButton, pending && styles.disabled]}>
            {pending ? <ActivityIndicator color={colors.background} /> : <Text style={styles.saveLabel}>{kind === 'nickname' ? t('profile.nickname.save') : accountUiText(t, "저장")}</Text>}
          </Pressable>
        </> : <Text style={styles.hint}>{user ? accountUiText(t, "소셜 로그인 계정은 비밀번호를 변경할 수 없어요.") : (kind === 'nickname' ? t('profile.nickname.loginRequired') : accountUiText(t, "로그인 후 계정 정보를 변경할 수 있어요."))}</Text>}
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{accountUiText(t, error)}</Text>}
        {!!success && <Text accessibilityRole="alert" style={styles.success}>{accountUiText(t, success)}</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { minHeight: spacing.space56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.space16 },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { ...typography.titleM, color: colors.text, marginLeft: spacing.space8 },
  content: { paddingHorizontal: spacing.space24, paddingTop: spacing.space24, paddingBottom: spacing.space60 + spacing.space40 },
  field: { marginTop: spacing.space24 },
  label: { ...typography.label, color: colors.text, marginBottom: spacing.space8 },
  currentNickname: { ...typography.body, color: colors.text },
  input: { ...typography.body, minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: radius.radius12, paddingHorizontal: spacing.space16, color: colors.text },
  passwordRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.radius12 },
  passwordInput: { ...typography.body, color: colors.text, flex: 1, paddingHorizontal: spacing.space16, paddingVertical: spacing.space12 },
  eyeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  hint: { ...typography.label, color: colors.secondaryText, marginTop: spacing.space8 },
  saveButton: { minHeight: 52, marginTop: spacing.space32, backgroundColor: colors.primary, borderRadius: radius.radius12, alignItems: 'center', justifyContent: 'center' },
  saveLabel: { ...typography.body, color: colors.background, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  error: { ...typography.label, color: '#DC2626', marginTop: spacing.space16 },
  success: { ...typography.label, color: colors.primaryDark, marginTop: spacing.space16 },
});
