import { useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { clearTokens, getCurrentUser, login, saveTokens, setAuthUser } from '../../../lib/auth';
import { authenticateWithGoogle, beginGoogleSignup, getGoogleIdToken, GoogleAuthApiError } from '../../../lib/googleAuth';
import { colors, radius, spacing, typography } from '../../../theme/tokens';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const googleLoadingRef = useRef(false);
  const [error, setError] = useState('');

  async function handleLogin() {
    if (loading || googleLoadingRef.current) {
      if (__DEV__) console.info('[AUTH] login aborted: already submitting');
      return;
    }
    if (!email.trim() || !password) {
      if (__DEV__) console.info('[AUTH] login aborted: validation');
      setError('이메일과 비밀번호를 입력해 주세요.');
      return;
    }

    if (__DEV__) console.info('[AUTH] login validation passed');
    setLoading(true);
    setError('');
    let tokensSaved = false;
    let step = 'login request';
    try {
      const tokens = await login(email.trim(), password);
      step = 'tokens save';
      await saveTokens(tokens);
      if (__DEV__) console.info('[AUTH] tokens saved');
      tokensSaved = true;
      step = '/me request';
      if (__DEV__) console.info('[AUTH] /me source: login');
      const currentUser = await getCurrentUser(tokens.accessToken);
      step = 'auth state update';
      setAuthUser(currentUser);
      if (__DEV__) console.info('[AUTH] user state updated');
      step = 'navigation';
      router.replace('/(tabs)');
    } catch (cause) {
      if (__DEV__) console.info('[AUTH] login failed at:', step, cause instanceof Error ? cause.message : 'unknown error');
      if (tokensSaved) {
        try {
          await clearTokens();
        } catch {
          // Keep the original login error visible if secure storage cleanup fails.
        }
      }
      setError(cause instanceof Error ? cause.message : '로그인에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    if (loading || googleLoadingRef.current) return;
    if (__DEV__) console.info('[GOOGLE] button pressed');
    googleLoadingRef.current = true;
    setGoogleLoading(true);
    setError('');
    let tokensSaved = false;
    try {
      const idToken = await getGoogleIdToken();
      if (idToken === null) return;
      const result = await authenticateWithGoogle(idToken);
      if (result.kind === 'signup') {
        beginGoogleSignup(result.signupToken, result.expiresInSeconds);
        router.push({ pathname: '/profile/signup', params: { mode: 'google' } });
        return;
      }
      await saveTokens(result.tokens);
      tokensSaved = true;
      const currentUser = await getCurrentUser(result.tokens.accessToken);
      setAuthUser(currentUser);
      router.replace('/(tabs)');
    } catch (cause) {
      if (__DEV__) {
        const code = cause instanceof GoogleAuthApiError
          ? `HTTP ${cause.status}`
          : typeof cause === 'object' && cause !== null && 'code' in cause && typeof cause.code === 'string'
            ? cause.code : cause instanceof TypeError ? 'network' : 'unknown';
        console.info('[GOOGLE] signin error:', code);
      }
      if (tokensSaved) {
        try { await clearTokens(); } catch { /* Keep the original error visible. */ }
      }
      if (cause instanceof GoogleAuthApiError && cause.status === 409 && cause.code === 'email_already_registered') {
        setError('이미 이메일로 가입된 계정이 있어요.\n기존 로그인 방법으로 로그인해 주세요.');
      } else if (cause instanceof GoogleAuthApiError && cause.status === 401) {
        setError('Google 인증이 유효하지 않아요. 다시 시도해 주세요.');
      } else if (cause instanceof TypeError) {
        setError('네트워크 연결을 확인하고 다시 시도해 주세요.');
      } else if (typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'SIGN_IN_CANCELLED') {
        // Account selection was dismissed.
      } else if (typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'PLAY_SERVICES_NOT_AVAILABLE') {
        setError('Google Play 서비스를 확인해 주세요.');
      } else if (typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'DEVELOPER_ERROR') {
        setError('Google 로그인 설정을 확인해 주세요.');
      } else {
        setError(cause instanceof Error && (cause.message === 'Google 로그인 설정을 확인해 주세요.'
          || cause.message === 'Google 인증 정보를 받지 못했어요. 다시 시도해 주세요.')
          ? cause.message : 'Google 로그인에 실패했어요. 다시 시도해 주세요.');
      }
    } finally {
      googleLoadingRef.current = false;
      setGoogleLoading(false);
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
            accessibilityLabel="뒤로가기"
            onPress={() => router.canGoBack() ? router.back() : router.replace('/profile')}
            style={styles.backButton}
          >
            <ChevronLeft size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>로그인</Text>
        </View>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="이메일"
            placeholderTextColor={colors.secondaryText}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder="비밀번호"
            placeholderTextColor={colors.secondaryText}
            secureTextEntry
            autoComplete="password"
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={() => void handleLogin()}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable style={[styles.submit, (loading || googleLoading) && styles.disabled]} onPress={() => {
            if (__DEV__) console.info('[AUTH] login button pressed');
            void handleLogin();
          }} disabled={loading || googleLoading}>
            {loading ? <ActivityIndicator color={colors.background} /> : <Text style={styles.submitText}>로그인</Text>}
          </Pressable>
          <Pressable
            style={[styles.googleButton, (loading || googleLoading) && styles.disabled]}
            disabled={loading || googleLoading}
            onPress={() => void handleGoogleLogin()}
          >
            {googleLoading ? <ActivityIndicator color={colors.text} /> : <Text style={styles.googleButtonText}>Google로 계속하기</Text>}
          </Pressable>
        </View>

        <Text style={styles.signUp}>계정이 없나요? <Text style={styles.signUpLink} onPress={() => router.push('/profile/signup')}>회원가입</Text></Text>
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
