import { useTranslation } from '../../../hooks/useTranslation';
import { accountUiKey, accountUiText } from '../../../locales/accountUi';
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { authSessionGeneration, getAuthUser, login } from '../../../lib/auth';
import { useLoginAttempt } from '../../../hooks/useLoginAttempt';
import { finishLoginReturn, parseLoginReturn, signupHref } from '../../../lib/loginReturn';
import { authenticateWithGoogle, beginGoogleSignup, getGoogleIdToken, GoogleAuthApiError } from '../../../lib/googleAuth';
import { colors, radius, spacing, typography } from '../../../theme/tokens';

export default function Login() {
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{
    intent?: string; publicId?: string; resumeKey?: string; completedGeneration?: string;
    loginOrigin?: string; profileLoginSuccess?: string;
  }>();
  const target = parseLoginReturn(params);
  const scope = JSON.stringify(target);
  const authentication = useLoginAttempt(scope);
  const redirected = useRef(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const googleLoadingRef = useRef(false);
  const [error, setError] = useState('');

  useFocusEffect(useCallback(() => {
    setLoading(false); setGoogleLoading(false); googleLoadingRef.current = false;
    if (!target && params.loginOrigin === 'profile' && params.profileLoginSuccess === '1' && redirected.current) {
      const state = navigation.getState();
      if (state?.routes[state.index]?.name === 'login' && state.routes[state.index - 1]?.name === 'index') router.back();
      return;
    }
    if (target && params.completedGeneration === String(authSessionGeneration()) && getAuthUser() && !redirected.current) {
      redirected.current = true;
      finishLoginReturn(router, navigation, target);
    }
  }, [scope, params.completedGeneration, params.loginOrigin, params.profileLoginSuccess, router, navigation]));

  async function handleLogin() {
    if (loading || googleLoadingRef.current) {
      if (__DEV__) console.info('[AUTH] login aborted: already submitting');
      return;
    }
    if (!email.trim() || !password) {
      if (__DEV__) console.info('[AUTH] login aborted: validation');
      setError(accountUiKey('이메일과 비밀번호를 입력해 주세요.'));
      return;
    }

    const attempt = authentication.begin();
    if (!attempt || redirected.current) return;

    if (__DEV__) console.info('[AUTH] login validation passed');
    setLoading(true);
    setError('');
    let step = 'login request';
    try {
      const tokens = await login(email.trim(), password);
      step = 'authentication';
      if (!await authentication.authenticate(attempt, tokens) || !authentication.complete(attempt)) return;
      step = 'navigation';
      redirected.current = true;
      finishLoginReturn(router, navigation, target, params.loginOrigin);
    } catch (cause) {
      if (__DEV__) console.info('[AUTH] login failed at:', step, cause instanceof Error ? cause.message : 'unknown error');
      if (await authentication.fail(attempt)) {
        redirected.current = false;
        setError(accountUiKey(cause instanceof Error ? cause.message : '로그인에 실패했습니다.'));
      }
    } finally {
      if (authentication.active(attempt)) setLoading(false);
      authentication.release(attempt);
    }
  }

  async function handleGoogleLogin() {
    if (loading || googleLoadingRef.current) return;
    const attempt = authentication.begin();
    if (!attempt || redirected.current) return;
    if (__DEV__) console.info('[GOOGLE] button pressed');
    googleLoadingRef.current = true;
    setGoogleLoading(true);
    setError('');
    try {
      const idToken = await getGoogleIdToken();
      if (idToken === null || !authentication.valid(attempt)) return;
      const result = await authenticateWithGoogle(idToken);
      if (!authentication.valid(attempt)) return;
      if (result.kind === 'signup') {
        beginGoogleSignup(result.signupToken, result.expiresInSeconds);
        router.push(target ? signupHref(target, 'google') : { pathname: '/profile/signup', params: { mode: 'google' } });
        return;
      }
      if (!await authentication.authenticate(attempt, result.tokens) || !authentication.complete(attempt)) return;
      redirected.current = true;
      finishLoginReturn(router, navigation, target, params.loginOrigin);
    } catch (cause) {
      if (__DEV__) {
        const code = cause instanceof GoogleAuthApiError
          ? `HTTP ${cause.status}`
          : typeof cause === 'object' && cause !== null && 'code' in cause && typeof cause.code === 'string'
            ? cause.code : cause instanceof TypeError ? 'network' : 'unknown';
        console.info('[GOOGLE] signin error:', code);
      }
      if (!await authentication.fail(attempt)) return;
      redirected.current = false;
      if (cause instanceof GoogleAuthApiError && cause.status === 409 && cause.code === 'email_already_registered') {
        setError(accountUiKey('이미 이메일로 가입된 계정이 있어요.\n기존 로그인 방법으로 로그인해 주세요.'));
      } else if (cause instanceof GoogleAuthApiError && cause.status === 401) {
        setError(accountUiKey('Google 인증이 유효하지 않아요. 다시 시도해 주세요.'));
      } else if (cause instanceof TypeError) {
        setError(accountUiKey('네트워크 연결을 확인하고 다시 시도해 주세요.'));
      } else if (typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'SIGN_IN_CANCELLED') {
        // Account selection was dismissed.
      } else if (typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'PLAY_SERVICES_NOT_AVAILABLE') {
        setError(accountUiKey('Google Play 서비스를 확인해 주세요.'));
      } else if (typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'DEVELOPER_ERROR') {
        setError(accountUiKey('Google 로그인 설정을 확인해 주세요.'));
      } else {
        setError(accountUiKey(cause instanceof Error && (cause.message === 'Google 로그인 설정을 확인해 주세요.'
          || cause.message === 'Google 인증 정보를 받지 못했어요. 다시 시도해 주세요.')
          ? cause.message : 'Google 로그인에 실패했어요. 다시 시도해 주세요.'));
      }
    } finally {
      if (authentication.active(attempt)) {
        googleLoadingRef.current = false;
        setGoogleLoading(false);
      }
      authentication.release(attempt);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.layout}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityLabel={accountUiText(t, "뒤로가기")}
            onPress={() => router.canGoBack() ? router.back() : router.replace('/profile')}
            style={styles.backButton}
          >
            <ChevronLeft size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>{accountUiText(t, "로그인")}</Text>
        </View>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder={accountUiText(t, "이메일")}
            placeholderTextColor={colors.secondaryText}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder={accountUiText(t, "비밀번호")}
            placeholderTextColor={colors.secondaryText}
            secureTextEntry
            autoComplete="password"
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={() => void handleLogin()}
          />
          {error ? <Text style={styles.error}>{accountUiText(t, error)}</Text> : null}
          <Pressable style={[styles.submit, (loading || googleLoading) && styles.disabled]} onPress={() => {
            if (__DEV__) console.info('[AUTH] login button pressed');
            void handleLogin();
          }} disabled={loading || googleLoading}>
            {loading ? <ActivityIndicator color={colors.background} /> : <Text style={styles.submitText}>{accountUiText(t, "로그인")}</Text>}
          </Pressable>
          <Pressable
            style={[styles.googleButton, (loading || googleLoading) && styles.disabled]}
            disabled={loading || googleLoading}
            onPress={() => void handleGoogleLogin()}
          >
            {googleLoading ? <ActivityIndicator color={colors.text} /> : <Text style={styles.googleButtonText}>{accountUiText(t, "Google로 계속하기")}</Text>}
          </Pressable>
        </View>

        <Text style={styles.signUp}>{accountUiText(t, "계정이 없나요?") + ' '}<Text style={styles.signUpLink} onPress={() => router.push(target ? signupHref(target) : '/profile/signup')}>{accountUiText(t, "회원가입")}</Text></Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  layout: { flex: 1, paddingHorizontal: spacing.space16 },
  header: { height: 56, flexDirection: 'row', alignItems: 'center' },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.titleM, color: colors.text, marginLeft: spacing.space8 },
  form: { marginTop: spacing.space40, gap: spacing.space12 },
  input: {
    height: 52,
    paddingHorizontal: spacing.space16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.radius8,
    color: colors.text,
    ...typography.body,
  },
  error: { ...typography.caption, color: '#B91C1C' },
  submit: {
    height: 52,
    marginTop: spacing.space8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.radius8,
    backgroundColor: colors.primary,
  },
  disabled: { opacity: 0.6 },
  submitText: { ...typography.label, color: colors.background },
  googleButton: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.radius8,
  },
  googleButtonText: { ...typography.label, color: colors.text },
  signUp: { ...typography.label, color: colors.secondaryText, textAlign: 'center', marginTop: 'auto', marginBottom: spacing.space24 },
  signUpLink: { color: colors.primaryDark },
});
