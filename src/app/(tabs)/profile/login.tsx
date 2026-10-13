import {
  useFocusEffect,
  useLocalSearchParams,
  useNavigation,
  useRouter,
} from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "../../../hooks/useTranslation";
import { accountUiKey, accountUiText } from "../../../locales/accountUi";

import { useFonts } from "expo-font";
import { Image } from "expo-image";
import { noticeStyles } from "../../../components/profile/NoticeLayout";
import { useLoginAttempt } from "../../../hooks/useLoginAttempt";
import {
  appleLoginErrorMessage,
  authenticateWithApple,
  beginAppleSignup,
  isAppleAuthenticationAvailable,
} from "../../../lib/appleAuth";
import { authSessionGeneration, getAuthUser, login } from "../../../lib/auth";
import {
  authenticateWithGoogle,
  beginGoogleSignup,
  getGoogleIdToken,
  GoogleAuthApiError,
} from "../../../lib/googleAuth";
import {
  finishLoginReturn,
  parseLoginReturn,
  signupHref,
} from "../../../lib/loginReturn";
import { colors, radius, spacing, typography } from "../../../theme/tokens";

export default function Login() {
  const { t } = useTranslation();
  const [googleFontLoaded] = useFonts({
    GoogleSansMedium: require("../../../../assets/fonts/google-sans-medium.ttf"),
  });
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{
    intent?: string;
    publicId?: string;
    resumeKey?: string;
    completedGeneration?: string;
    loginOrigin?: string;
    profileLoginSuccess?: string;
  }>();
  const target = parseLoginReturn(params);
  const scope = JSON.stringify(target);
  const authentication = useLoginAttempt(scope);
  const redirected = useRef(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const googleLoadingRef = useRef(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const appleLoadingRef = useRef(false);
  const [error, setError] = useState("");

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (Platform.OS === "ios") {
        void isAppleAuthenticationAvailable().then((available) => {
          if (active) setAppleAvailable(available);
        });
      }
      setAppleLoading(false);
      appleLoadingRef.current = false;
      return () => {
        active = false;
      };
    }, []),
  );

  useFocusEffect(
    useCallback(() => {
      setLoading(false);
      setGoogleLoading(false);
      googleLoadingRef.current = false;
      if (
        !target &&
        params.loginOrigin === "profile" &&
        params.profileLoginSuccess === "1" &&
        redirected.current
      ) {
        const state = navigation.getState();
        if (
          state?.routes[state.index]?.name === "login" &&
          state.routes[state.index - 1]?.name === "index"
        )
          router.back();
        return;
      }
      if (
        params.completedGeneration === String(authSessionGeneration()) &&
        getAuthUser() &&
        !redirected.current
      ) {
        redirected.current = true;
        finishLoginReturn(router, navigation, target, params.loginOrigin);
      }
    }, [
      scope,
      params.completedGeneration,
      params.loginOrigin,
      params.profileLoginSuccess,
      router,
      navigation,
    ]),
  );

  async function handleLogin() {
    if (loading || googleLoadingRef.current || appleLoadingRef.current) {
      if (__DEV__) console.info("[AUTH] login aborted: already submitting");
      return;
    }
    if (!email.trim() || !password) {
      if (__DEV__) console.info("[AUTH] login aborted: validation");
      setError(accountUiKey("이메일과 비밀번호를 입력해 주세요."));
      return;
    }

    const attempt = authentication.begin();
    if (!attempt || redirected.current) return;

    if (__DEV__) console.info("[AUTH] login validation passed");
    setLoading(true);
    setError("");
    let step = "login request";
    try {
      const tokens = await login(email.trim(), password);
      step = "authentication";
      if (
        !(await authentication.authenticate(attempt, tokens)) ||
        !authentication.complete(attempt)
      )
        return;
      step = "navigation";
      redirected.current = true;
      finishLoginReturn(router, navigation, target, params.loginOrigin);
    } catch (cause) {
      if (__DEV__)
        console.info(
          "[AUTH] login failed at:",
          step,
          cause instanceof Error ? cause.message : "unknown error",
        );
      if (await authentication.fail(attempt)) {
        redirected.current = false;
        setError(
          accountUiKey(
            cause instanceof Error ? cause.message : "로그인에 실패했습니다.",
          ),
        );
      }
    } finally {
      if (authentication.active(attempt)) setLoading(false);
      authentication.release(attempt);
    }
  }

  async function handleGoogleLogin() {
    if (loading || googleLoadingRef.current || appleLoadingRef.current) return;
    const attempt = authentication.begin();
    if (!attempt || redirected.current) return;
    if (__DEV__) console.info("[GOOGLE] button pressed");
    googleLoadingRef.current = true;
    setGoogleLoading(true);
    setError("");
    try {
      const idToken = await getGoogleIdToken();
      if (idToken === null || !authentication.valid(attempt)) return;
      const result = await authenticateWithGoogle(idToken);
      if (!authentication.valid(attempt)) return;
      if (result.kind === "signup") {
        beginGoogleSignup(result.signupToken, result.expiresInSeconds);
        router.push(signupHref(target, "google", params.loginOrigin));
        return;
      }
      if (
        !(await authentication.authenticate(attempt, result.tokens)) ||
        !authentication.complete(attempt)
      )
        return;
      redirected.current = true;
      finishLoginReturn(router, navigation, target, params.loginOrigin);
    } catch (cause) {
      if (__DEV__) {
        const code =
          cause instanceof GoogleAuthApiError
            ? `HTTP ${cause.status}`
            : typeof cause === "object" &&
                cause !== null &&
                "code" in cause &&
                typeof cause.code === "string"
              ? cause.code
              : cause instanceof TypeError
                ? "network"
                : "unknown";
        console.info("[GOOGLE] signin error:", code);
      }
      if (!(await authentication.fail(attempt))) return;
      redirected.current = false;
      if (
        cause instanceof GoogleAuthApiError &&
        cause.status === 409 &&
        cause.code === "email_already_registered"
      ) {
        setError(
          accountUiKey(
            "이미 이메일로 가입된 계정이 있어요.\n기존 로그인 방법으로 로그인해 주세요.",
          ),
        );
      } else if (cause instanceof GoogleAuthApiError && cause.status === 401) {
        setError(
          accountUiKey("Google 인증이 유효하지 않아요. 다시 시도해 주세요."),
        );
      } else if (cause instanceof TypeError) {
        setError(accountUiKey("네트워크 연결을 확인하고 다시 시도해 주세요."));
      } else if (
        typeof cause === "object" &&
        cause !== null &&
        "code" in cause &&
        cause.code === "SIGN_IN_CANCELLED"
      ) {
        // Account selection was dismissed.
      } else if (
        typeof cause === "object" &&
        cause !== null &&
        "code" in cause &&
        cause.code === "PLAY_SERVICES_NOT_AVAILABLE"
      ) {
        setError(accountUiKey("Google Play 서비스를 확인해 주세요."));
      } else if (
        typeof cause === "object" &&
        cause !== null &&
        "code" in cause &&
        cause.code === "DEVELOPER_ERROR"
      ) {
        setError(accountUiKey("Google 로그인 설정을 확인해 주세요."));
      } else {
        setError(
          accountUiKey(
            cause instanceof Error &&
              (cause.message === "Google 로그인 설정을 확인해 주세요." ||
                cause.message ===
                  "Google 인증 정보를 받지 못했어요. 다시 시도해 주세요.")
              ? cause.message
              : "Google 로그인에 실패했어요. 다시 시도해 주세요.",
          ),
        );
      }
    } finally {
      if (authentication.active(attempt)) {
        googleLoadingRef.current = false;
        setGoogleLoading(false);
      }
      authentication.release(attempt);
    }
  }

  async function handleAppleLogin() {
    if (
      loading ||
      googleLoadingRef.current ||
      appleLoadingRef.current ||
      redirected.current
    )
      return;
    const attempt = authentication.begin();
    if (!attempt) return;
    appleLoadingRef.current = true;
    setAppleLoading(true);
    setError("");
    try {
      const result = await authenticateWithApple(() =>
        authentication.valid(attempt),
      );
      if (!result || !authentication.valid(attempt)) return;
      if (result.kind === "signup") {
        beginAppleSignup(result.signupToken, result.expiresInSeconds);
        router.push(signupHref(target, "apple", params.loginOrigin));
        return;
      }
      if (
        !(await authentication.authenticate(attempt, result.tokens)) ||
        !authentication.complete(attempt)
      )
        return;
      redirected.current = true;
      finishLoginReturn(router, navigation, target, params.loginOrigin);
    } catch (cause) {
      if (!(await authentication.fail(attempt))) return;
      setError(accountUiKey(appleLoginErrorMessage(cause)));
    } finally {
      if (authentication.active(attempt)) {
        appleLoadingRef.current = false;
        setAppleLoading(false);
      }
      authentication.release(attempt);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={noticeStyles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accountUiText(t, "뒤로가기")}
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/profile")
          }
          style={noticeStyles.back}
        >
          <ChevronLeft
            size={24}
            color={colors.text}
            style={noticeStyles.backIcon}
          />
        </Pressable>
        <Text style={noticeStyles.headerTitle}>
          {accountUiText(t, "로그인")}
        </Text>
        <View pointerEvents="none" style={noticeStyles.back} />
      </View>
      <KeyboardAvoidingView
        style={styles.layout}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.form}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.inputs}>
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
          </View>
          {error ? (
            <Text style={styles.error}>{accountUiText(t, error)}</Text>
          ) : null}
          <Pressable
            style={[
              styles.submit,
              (loading || googleLoading || appleLoading) && styles.disabled,
            ]}
            onPress={() => {
              if (__DEV__) console.info("[AUTH] login button pressed");
              void handleLogin();
            }}
            disabled={loading || googleLoading || appleLoading}
          >
            {loading ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <Text style={styles.submitText}>
                {accountUiText(t, "로그인")}
              </Text>
            )}
          </Pressable>
          <Text style={styles.signUp}>
            {accountUiText(t, "계정이 없나요?") + " "}
            <Text
              style={styles.signUpLink}
              onPress={() =>
                router.push(signupHref(target, undefined, params.loginOrigin))
              }
            >
              {accountUiText(t, "회원가입")}
            </Text>
          </Text>
          <View style={styles.separator}>
            <View style={styles.separatorLine} />
            <Text style={styles.separatorText}>{t("account.login.or")}</Text>
            <View style={styles.separatorLine} />
          </View>
          <View style={styles.socialButtons}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={accountUiText(t, "Google로 계속하기")}
              accessibilityState={{
                disabled: loading || googleLoading || appleLoading,
                busy: googleLoading,
              }}
              style={[
                styles.googleButton,
                (loading || googleLoading || appleLoading) && styles.disabled,
              ]}
              disabled={loading || googleLoading || appleLoading}
              onPress={() => void handleGoogleLogin()}
            >
              {googleLoading ? (
                <ActivityIndicator color="#1F1F1F" />
              ) : (
                <View style={styles.socialButtonContent}>
                  <Image
                    source={require("../../../../assets/images/auth/google-g.png")}
                    style={styles.googleLogo}
                    contentFit="contain"
                    accessible={false}
                  />
                  <Text
                    style={[
                      styles.googleButtonText,
                      googleFontLoaded && styles.googleFont,
                    ]}
                  >
                    {accountUiText(t, "Google로 계속하기")}
                  </Text>
                </View>
              )}
            </Pressable>
            {Platform.OS === "ios" && appleAvailable ? (
              <Pressable
                testID="apple-login-button"
                accessibilityRole="button"
                accessibilityLabel={t("account.login.apple")}
                disabled={loading || googleLoading || appleLoading}
                style={[
                  styles.appleButton,
                  (loading || googleLoading || appleLoading) && styles.disabled,
                ]}
                accessibilityState={{
                  disabled: loading || googleLoading || appleLoading,
                  busy: appleLoading,
                }}
                onPress={() => void handleAppleLogin()}
              >
                {appleLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <View style={styles.socialButtonContent}>
                    <Image
                      source={require("../../../../assets/images/auth/apple-logo-white.svg")}
                      style={styles.appleLogo}
                      contentFit="contain"
                      accessible={false}
                    />
                    <Text style={styles.appleButtonText}>
                      {t("account.login.apple")}
                    </Text>
                  </View>
                )}
              </Pressable>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  layout: { flex: 1 },
  form: {
    paddingHorizontal: spacing.space16,
    paddingTop: spacing.space32,
    paddingBottom: spacing.space24,
  },
  inputs: { gap: spacing.space12 },
  input: {
    height: 52,
    paddingHorizontal: spacing.space16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.radius8,
    color: colors.text,
    ...typography.body,
  },
  error: {
    ...typography.caption,
    color: "#B91C1C",
    marginTop: spacing.space12,
  },
  submit: {
    height: 52,
    marginTop: spacing.space20,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.radius8,
    backgroundColor: colors.primary,
  },
  disabled: { opacity: 0.6 },
  submitText: { ...typography.label, color: colors.background },
  googleButton: {
    height: 52,
    width: "100%",
    backgroundColor: "#F2F2F2",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.radius8,
  },
  googleButtonText: {
    width: "100%",
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "500",
    color: "#1F1F1F",
    textAlign: "center",
  },
  googleFont: { fontFamily: "GoogleSansMedium" },
  googleLogo: { position: "absolute", left: 24, width: 20, height: 20 },
  appleButton: {
    width: "100%",
    minWidth: 140,
    height: 52,
    backgroundColor: "#000000",
    borderRadius: radius.radius8,
    alignItems: "center",
    justifyContent: "center",
  },
  appleButtonText: {
    width: "100%",
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "500",
    color: "#FFFFFF",
    textAlign: "center",
  },
  // The white SVG path spans x=7.75..23.2109027 in its 31x44 canvas.
  // Align its visible bounds center to the Google logo center at x=34dp.
  appleLogo: {
    position: "absolute",
    left: 34 - (((7.75 + 23.2109027) / 2) * 52) / 44,
    width: (31 * 52) / 44,
    height: 52,
  },
  socialButtonContent: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  signUp: {
    ...typography.label,
    color: colors.secondaryText,
    textAlign: "center",
    marginTop: spacing.space16,
  },
  signUpLink: { color: colors.primaryDark },
  separator: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.space12,
    marginTop: spacing.space32,
    marginBottom: spacing.space20,
  },
  separatorLine: { flex: 1, height: 1, backgroundColor: colors.border },
  separatorText: { ...typography.label, color: colors.secondaryText },
  socialButtons: { gap: spacing.space12 },
});
