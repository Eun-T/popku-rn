import { useTranslation } from '../../../hooks/useTranslation';
import { accountUiKey, accountUiText } from '../../../locales/accountUi';
import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { checkEmailAvailability, EmailVerificationApiError, sendEmailVerification, verifyEmailCode } from '../../../lib/emailVerification';
import { authSessionGeneration, DEVICE_ID } from '../../../lib/auth';
import { useLoginAttempt } from '../../../hooks/useLoginAttempt';
import { completedSignupHref, loginHref, parseLoginReturn } from '../../../lib/loginReturn';
import { clearGoogleSignup, completeGoogleSignup, getGoogleSignupToken, GoogleAuthApiError } from '../../../lib/googleAuth';
import { checkNicknameAvailability } from '../../../lib/nicknameAvailability';
import { normalizeNickname, isValidNickname, isValidPassword } from '../../../lib/accountPolicy';
import { registerUser, SignupApiError, type SignupRequest } from '../../../lib/signup';
import { colors, radius, spacing, typography } from '../../../theme/tokens';

const VERIFICATION_SECONDS = 5 * 60;
const RESEND_COOLDOWN_SECONDS = 60;
type SignupStep = 'emailPassword' | 'nickname' | 'terms';
type VerificationStage = 'email' | 'code' | 'verified';
type PendingOperation = 'send' | 'resend' | 'verify' | null;
type ConsentKind = 'terms' | 'privacy' | 'marketing';
type ConsentRowProps = {
  label: string;
  checked: boolean;
  onToggle: () => void;
  onOpenDetails: () => void;
};

function ConsentMark({ checked }: { checked: boolean }) {
  return (
    <View style={[styles.consentMark, checked && styles.consentMarkChecked]}>
      {checked ? <Check size={16} color={colors.background} strokeWidth={2.5} /> : null}
    </View>
  );
}

function ConsentRow({ label, checked, onToggle, onOpenDetails }: ConsentRowProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.consentRow}>
      <Pressable
        style={styles.consentCheckboxTouch}
        accessibilityRole="checkbox"
        accessibilityLabel={label}
        accessibilityState={{ checked }}
        onPress={onToggle}
      >
        <ConsentMark checked={checked} />
      </Pressable>
      <Pressable
        style={styles.consentDetails}
        accessibilityRole="button"
        accessibilityLabel={label + accountUiText(t, " 자세히 보기")}
        onPress={onOpenDetails}
      >
        <Text style={styles.consentLabel}>{label}</Text>
        <ChevronRight size={20} color={colors.secondaryText} />
      </Pressable>
    </View>
  );
}

function sendErrorMessage(error: unknown): string {
  if (error instanceof EmailVerificationApiError) {
    if (error.status === 400) return '이메일 형식을 확인해 주세요.';
    if (error.status === 409) return '이미 가입된 이메일이에요.';
    if (error.status === 429) return '잠시 후 다시 인증번호를 요청해 주세요.';
    if (error.status === 503) return '인증번호를 보내지 못했어요. 잠시 후 다시 시도해 주세요.';
    return '인증번호를 보내지 못했어요. 다시 시도해 주세요.';
  }
  if (error instanceof TypeError) return '네트워크 연결을 확인하고 다시 시도해 주세요.';
  return '요청을 처리하지 못했어요. 다시 시도해 주세요.';
}

function verifyErrorMessage(error: unknown): string {
  if (error instanceof EmailVerificationApiError) {
    if (error.status === 400) return '인증번호를 확인해 주세요.';
    if (error.status === 410) return '인증번호가 만료됐어요. 재전송해 주세요.';
    if (error.status === 429) return '인증 시도 횟수를 초과했어요. 인증번호를 재전송해 주세요.';
    if (error.status === 409) return '이미 인증된 이메일이에요.';
    return '인증번호를 확인하지 못했어요. 다시 시도해 주세요.';
  }
  if (error instanceof TypeError) return '네트워크 연결을 확인하고 다시 시도해 주세요.';
  return '요청을 처리하지 못했어요. 다시 시도해 주세요.';
}

function joinErrorMessage(error: unknown): string {
  if (error instanceof SignupApiError) {
    if (error.status === 409) {
      if (error.reason === 'Email already registered') return '이미 가입된 이메일이에요.';
      if (error.reason === 'Nickname already used') return '이미 사용 중인 닉네임이에요.';
      return '이메일 또는 닉네임이 이미 사용 중이에요.';
    }
    if (error.status === 403) return '이메일 인증이 만료됐어요. 회원가입을 다시 시작해 주세요.';
    if (error.status === 400) {
      if (error.reason === 'Password does not meet policy') return '비밀번호 조건을 확인해 주세요.';
      if (error.reason === 'Required consent is missing') return '필수 약관 동의를 확인해 주세요.';
      if (error.reason === 'Invalid email') return '이메일 형식을 확인해 주세요.';
      if (error.reason === 'Invalid nickname') return '닉네임 형식을 확인해 주세요.';
      return '입력 정보를 확인해 주세요.';
    }
    return '회원가입을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.';
  }
  if (error instanceof TypeError) return '네트워크 연결을 확인하고 다시 시도해 주세요.';
  return '회원가입을 완료하지 못했어요. 다시 시도해 주세요.';
}

function googleJoinErrorMessage(error: unknown): string {
  if (error instanceof GoogleAuthApiError) {
    if (error.status === 401) return 'Google 가입 시간이 만료됐어요. 다시 로그인해 주세요.';
    if (error.status === 409) {
      if (error.reason === 'Nickname already used') return '이미 사용 중인 닉네임이에요.';
      if (error.reason === 'Email already registered') return '이미 가입된 이메일이에요.';
      return '이메일 또는 닉네임이 이미 사용 중이에요.';
    }
    if (error.status === 400) return '닉네임과 필수 약관 동의를 확인해 주세요.';
  }
  if (error instanceof TypeError) return '네트워크 연결을 확인하고 다시 시도해 주세요.';
  return 'Google 가입을 완료하지 못했어요. 다시 시도해 주세요.';
}

export default function SignUpEmail() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string; intent?: string; publicId?: string; resumeKey?: string }>();
  const { mode } = params;
  const target = parseLoginReturn(params);
  const scope = JSON.stringify(target);
  const authentication = useLoginAttempt(scope);
  const isGoogle = mode === 'google';
  const [signupStep, setSignupStep] = useState<SignupStep>(isGoogle ? 'nickname' : 'emailPassword');
  const [email, setEmail] = useState('');
  const [verificationStage, setVerificationStage] = useState<VerificationStage>('email');
  const [signupProof, setSignupProof] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(VERIFICATION_SECONDS);
  const [resendSecondsLeft, setResendSecondsLeft] = useState(0);
  const [emailError, setEmailError] = useState('');
  const [codeError, setCodeError] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [confirmationTouched, setConfirmationTouched] = useState(false);
  const [nickname, setNickname] = useState('');
  const [nicknameError, setNicknameError] = useState<'taken' | 'request' | null>(null);
  const [nicknameChecking, setNicknameChecking] = useState(false);
  const [confirmedNickname, setConfirmedNickname] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [marketingAccepted, setMarketingAccepted] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [pending, setPending] = useState<PendingOperation>(null);
  const pendingRef = useRef(false);
  const requestVersionRef = useRef(0);
  const nicknameRequestRef = useRef<AbortController | null>(null);
  const joiningRef = useRef(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const canReceiveCode = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canVerify = /^\d{6}$/.test(code);
  const canContinue = verificationStage === 'verified' && signupProof !== null
    && isValidPassword(password)
    && passwordConfirmation === password;
  const showPasswordMismatch = confirmationTouched
    && passwordConfirmation.length > 0
    && passwordConfirmation !== password;
  const normalizedNickname = normalizeNickname(nickname);
  const nicknameIsValid = isValidNickname(normalizedNickname);
  const canContinueNickname = signupStep === 'nickname' && nicknameIsValid;
  const allAccepted = termsAccepted && privacyAccepted && marketingAccepted;
  const signupDraft = {
    email: email.trim(),
    password,
    nickname: confirmedNickname,
    termsAccepted,
    privacyAccepted,
    marketingAccepted,
  };
  const canJoin = signupStep === 'terms'
    && signupDraft.nickname !== null
    && signupDraft.termsAccepted
    && signupDraft.privacyAccepted
    && (isGoogle || signupProof !== null);
  const remainingTime = String(Math.floor(secondsLeft / 60)).padStart(2, '0') + ':' + String(secondsLeft % 60).padStart(2, '0');

  useEffect(() => {
    if (verificationStage !== 'code' || secondsLeft === 0) return;
    const timer = setTimeout(() => setSecondsLeft((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [verificationStage, secondsLeft]);

  useEffect(() => {
    if (verificationStage !== 'code' || resendSecondsLeft === 0) return;
    const timer = setTimeout(() => setResendSecondsLeft((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [verificationStage, resendSecondsLeft]);

  useEffect(() => {
    if (signupStep !== 'emailPassword') scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  }, [signupStep]);

  useEffect(() => {
    if (isGoogle && !getGoogleSignupToken()) {
      if (target) router.dismissTo(loginHref(target));
      else router.replace('/profile/login');
    }
  }, [isGoogle, router, scope]);

  useEffect(() => () => {
    if (isGoogle) clearGoogleSignup();
  }, [isGoogle]);

  function cancelNicknameCheck() {
    nicknameRequestRef.current?.abort();
    nicknameRequestRef.current = null;
    setNicknameChecking(false);
  }

  function handleNicknameChange(value: string) {
    cancelNicknameCheck();
    setNickname(value);
    setNicknameError(null);
    setConfirmedNickname(null);
  }

  function handleBack() {
    if (joiningRef.current) return;
    if (signupStep === 'terms') {
      Keyboard.dismiss();
      setSignupStep('nickname');
      return;
    }
    if (signupStep === 'nickname') {
      if (isGoogle) {
        clearGoogleSignup();
        router.dismissTo(target ? loginHref(target) : '/profile/login');
        return;
      }
      Keyboard.dismiss();
      cancelNicknameCheck();
      setNicknameError(null);
      setConfirmedNickname(null);
      setSignupStep('emailPassword');
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace(target ? loginHref(target) : '/profile/login');
  }

  function handlePasswordNext() {
    if (!canContinue) return;
    Keyboard.dismiss();
    setSignupStep('nickname');
  }

  async function handleNicknameNext() {
    if (!canContinueNickname || nicknameRequestRef.current) return;
    const controller = new AbortController();
    nicknameRequestRef.current = controller;
    setNicknameChecking(true);
    setNicknameError(null);
    setConfirmedNickname(null);
    try {
      const available = await checkNicknameAvailability(normalizedNickname, controller.signal);
      if (controller.signal.aborted || nicknameRequestRef.current !== controller) return;
      if (available) {
        setConfirmedNickname(normalizedNickname);
        Keyboard.dismiss();
        setSignupStep('terms');
      } else {
        setNicknameError('taken');
      }
    } catch {
      if (!controller.signal.aborted && nicknameRequestRef.current === controller) {
        setNicknameError('request');
      }
    } finally {
      if (nicknameRequestRef.current === controller) {
        nicknameRequestRef.current = null;
        setNicknameChecking(false);
      }
    }
  }

  function handleAllConsentToggle() {
    const nextValue = !allAccepted;
    setTermsAccepted(nextValue);
    setPrivacyAccepted(nextValue);
    setMarketingAccepted(nextValue);
  }

  function handleConsentDetails(_kind: ConsentKind) {
    // The relevant terms document screen will be connected here.
  }

  async function handleJoin() {
    if (!canJoin || joiningRef.current || signupDraft.nickname === null) return;
    const attempt = isGoogle ? authentication.begin() : null;
    if (isGoogle && !attempt) return;
    joiningRef.current = true;
    setJoining(true);
    setJoinError('');
    const consents = {
      termsOfService: signupDraft.termsAccepted,
      privacyPolicy: signupDraft.privacyAccepted,
      marketing: signupDraft.marketingAccepted,
    };
    try {
      if (isGoogle) {
        const signupToken = getGoogleSignupToken();
        if (!signupToken) {
          setJoinError(accountUiKey('Google 가입 시간이 만료됐어요. 다시 로그인해 주세요.'));
          return;
        }
        const tokens = await completeGoogleSignup({ signupToken, nickname: signupDraft.nickname, consents, deviceId: DEVICE_ID });
        if (!await authentication.authenticate(attempt!, tokens) || !authentication.complete(attempt!)) return;
      } else {
        if (!signupProof) return;
        const request: SignupRequest = {
          email: signupDraft.email,
          password: signupDraft.password,
          nickname: signupDraft.nickname,
          consents,
          signupProof,
        };
        await registerUser(request);
        setSignupProof(null);
      }
    } catch (error) {
      if (attempt && !await authentication.fail(attempt)) return;
      if (!isGoogle && error instanceof SignupApiError && error.status === 403) {
        setSignupProof(null);
        setVerificationStage('email');
        setCode('');
        setEmailError(accountUiKey('이메일 인증을 다시 진행해 주세요.'));
        setSignupStep('emailPassword');
        return;
      }
      setJoinError(accountUiKey(isGoogle ? googleJoinErrorMessage(error) : joinErrorMessage(error)));
      return;
    } finally {
      if (!attempt || authentication.active(attempt)) {
        joiningRef.current = false;
        setJoining(false);
      }
      if (attempt) authentication.release(attempt);
    }
    setPassword('');
    setPasswordConfirmation('');
    setCode('');
    setEmail('');
    setNickname('');
    setConfirmedNickname(null);
    Keyboard.dismiss();
    if (isGoogle) {
      clearGoogleSignup();
      if (target) router.dismissTo(completedSignupHref(target, authSessionGeneration()));
      else router.replace('/(tabs)');
    } else {
      router.dismissTo(target ? loginHref(target) : '/profile/login');
    }
  }

  function handleEmailChange(value: string) {
    if (verificationStage === 'verified') return;
    requestVersionRef.current += 1;
    pendingRef.current = false;
    setPending(null);
    setEmail(value);
    setSignupProof(null);
    setVerificationStage('email');
    setCode('');
    setSecondsLeft(VERIFICATION_SECONDS);
    setResendSecondsLeft(0);
    setEmailError('');
    setCodeError('');
  }

  function beginRequest(operation: Exclude<PendingOperation, null>): number | null {
    if (pendingRef.current) return null;
    pendingRef.current = true;
    setPending(operation);
    return requestVersionRef.current;
  }

  function finishRequest(version: number) {
    if (requestVersionRef.current !== version) return;
    pendingRef.current = false;
    setPending(null);
  }

  async function handleReceiveCode() {
    if (!canReceiveCode) return;
    const version = beginRequest('send');
    if (version === null) return;
    setSignupProof(null);
    const targetEmail = email.trim();
    setEmailError('');
    try {
      const available = await checkEmailAvailability(targetEmail);
      if (requestVersionRef.current !== version) return;
      if (!available) {
        setEmailError(accountUiKey('이미 가입된 이메일이에요.'));
        return;
      }
      await sendEmailVerification(targetEmail);
      if (requestVersionRef.current !== version) return;
      setCode('');
      setCodeError('');
      setSecondsLeft(VERIFICATION_SECONDS);
      setResendSecondsLeft(RESEND_COOLDOWN_SECONDS);
      setVerificationStage('code');
    } catch (error) {
      if (requestVersionRef.current === version) setEmailError(accountUiKey(sendErrorMessage(error)));
    } finally {
      finishRequest(version);
    }
  }

  async function handleResend() {
    if (verificationStage !== 'code' || resendSecondsLeft > 0) return;
    const version = beginRequest('resend');
    if (version === null) return;
    setSignupProof(null);
    setCodeError('');
    try {
      await sendEmailVerification(email.trim());
      if (requestVersionRef.current !== version) return;
      setCode('');
      setSecondsLeft(VERIFICATION_SECONDS);
      setResendSecondsLeft(RESEND_COOLDOWN_SECONDS);
    } catch (error) {
      if (requestVersionRef.current === version) setCodeError(accountUiKey(sendErrorMessage(error)));
    } finally {
      finishRequest(version);
    }
  }

  async function handleVerify() {
    if (verificationStage !== 'code' || !canVerify) return;
    const version = beginRequest('verify');
    if (version === null) return;
    setSignupProof(null);
    setCodeError('');
    try {
      const proof = await verifyEmailCode(email.trim(), code);
      if (requestVersionRef.current !== version) return;
      setSignupProof(proof);
      Keyboard.dismiss();
      setVerificationStage('verified');
    } catch (error) {
      if (requestVersionRef.current === version) setCodeError(accountUiKey(verifyErrorMessage(error)));
    } finally {
      finishRequest(version);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.layout}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => {
            if (signupStep === 'emailPassword' && verificationStage === 'verified') {
              scrollViewRef.current?.scrollToEnd({ animated: true });
            }
          }}
        >
          <View style={styles.header}>
            <Pressable
              accessibilityLabel={accountUiText(t, "뒤로가기")}
              onPress={handleBack}
              style={styles.backButton}
            >
              <ChevronLeft size={24} color={colors.text} />
            </Pressable>
            <Text style={styles.title}>{accountUiText(t, "회원가입")}</Text>
          </View>

          <View style={styles.form}>
            {signupStep === 'emailPassword' ? (
              <>
                <Text style={styles.prompt}>{accountUiText(t, "이메일을 입력해 주세요")}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={accountUiText(t, "이메일")}
                  placeholderTextColor={colors.secondaryText}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  editable={verificationStage !== 'verified'}
                  value={email}
                  onChangeText={handleEmailChange}
                />
                {emailError ? <Text style={styles.error}>{accountUiText(t, emailError)}</Text> : null}
                {verificationStage === 'email' ? (
                  <Pressable
                    style={[styles.submit, (!canReceiveCode || pending !== null) && styles.disabled]}
                    disabled={!canReceiveCode || pending !== null}
                    onPress={() => void handleReceiveCode()}
                  >
                    <Text style={styles.submitText}>{accountUiText(t, "인증번호 받기")}</Text>
                  </Pressable>
                ) : (
                  <View style={styles.verificationSection}>
                    <View style={styles.codeInputContainer}>
                      <TextInput
                        style={[styles.input, styles.codeInput]}
                        placeholder={accountUiText(t, "인증번호 6자리")}
                        placeholderTextColor={colors.secondaryText}
                        keyboardType="number-pad"
                        maxLength={6}
                        editable={verificationStage === 'code' && pending !== 'verify'}
                        value={code}
                        onChangeText={(value) => {
                          setCode(value.replace(/\D/g, '').slice(0, 6));
                          setCodeError('');
                        }}
                      />
                      <Pressable
                        style={styles.inlineVerifyButton}
                        disabled={verificationStage !== 'code' || !canVerify || pending !== null}
                        onPress={() => void handleVerify()}
                      >
                        <Text style={[styles.inlineVerifyText, (verificationStage === 'code' && (!canVerify || pending !== null)) && styles.inactiveVerifyText]}>
                          {verificationStage === 'verified' ? accountUiText(t, "인증완료") : accountUiText(t, "인증하기")}
                        </Text>
                      </Pressable>
                    </View>
                    {verificationStage === 'code' ? (
                      <>
                        {codeError ? <Text style={styles.error}>{accountUiText(t, codeError)}</Text> : null}
                        <View style={styles.verificationOptions}>
                          <Text style={styles.timer}>{remainingTime}</Text>
                          <Pressable disabled={pending !== null || resendSecondsLeft > 0} onPress={() => void handleResend()}>
                            <Text style={[styles.resend, (pending !== null || resendSecondsLeft > 0) && styles.disabled]}>{accountUiText(t, "인증번호 재전송")}</Text>
                          </Pressable>
                        </View>
                  </>
                ) : (
                  <Text style={styles.verifiedMessage}>{accountUiText(t, "이메일 인증이 완료됐어요.")}</Text>
                )}
              </View>
            )}
            {verificationStage === 'verified' ? (
              <View style={styles.passwordSection}>
                <Text style={styles.prompt}>{accountUiText(t, "비밀번호를 입력해 주세요")}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={accountUiText(t, "비밀번호")}
                  placeholderTextColor={colors.secondaryText}
                  secureTextEntry
                  autoComplete="new-password"
                  value={password}
                  onChangeText={setPassword}
                />
                <Text style={styles.passwordHint}>{accountUiText(t, "영문과 숫자를 포함해 8자 이상 입력해 주세요.")}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={accountUiText(t, "비밀번호 확인")}
                  placeholderTextColor={colors.secondaryText}
                  secureTextEntry
                  autoComplete="new-password"
                  value={passwordConfirmation}
                  onChangeText={setPasswordConfirmation}
                  onBlur={() => setConfirmationTouched(true)}
                />
                {showPasswordMismatch ? <Text style={styles.error}>{accountUiText(t, "비밀번호가 일치하지 않아요.")}</Text> : null}
                <Pressable style={[styles.submit, !canContinue && styles.disabled]} disabled={!canContinue} onPress={handlePasswordNext}>
                  <Text style={styles.submitText}>{accountUiText(t, "다음")}</Text>
                </Pressable>
              </View>
            ) : null}
              </>
            ) : signupStep === 'nickname' ? (
              <>
                <Text style={styles.prompt}>{accountUiText(t, "닉네임을 입력해 주세요")}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={accountUiText(t, "닉네임")}
                  placeholderTextColor={colors.secondaryText}
                  autoCapitalize="none"
                  value={nickname}
                  onChangeText={handleNicknameChange}
                />
                <Text style={styles.nicknameHint}>{accountUiText(t, "2~10자로 입력해 주세요.")}</Text>
                {nickname.length > 0 && !nicknameIsValid ? (
                  <Text style={styles.error}>{accountUiText(t, "문자·숫자·밑줄로 2~10자 입력해 주세요.")}</Text>
                ) : confirmedNickname === normalizedNickname ? (
                  <Text style={styles.nicknameAvailable}>{accountUiText(t, "사용 가능한 닉네임이에요.")}</Text>
                ) : nicknameError === 'taken' ? (
                  <Text style={styles.error}>{accountUiText(t, "이미 사용 중인 닉네임이에요.")}</Text>
                ) : nicknameError === 'request' ? (
                  <Text style={styles.error}>{accountUiText(t, "닉네임을 확인하지 못했어요. 다시 시도해 주세요.")}</Text>
                ) : null}
                <Pressable
                  style={[styles.submit, (!canContinueNickname || nicknameChecking) && styles.disabled]}
                  disabled={!canContinueNickname || nicknameChecking}
                  onPress={() => void handleNicknameNext()}
                >
                  <Text style={styles.submitText}>{nicknameChecking ? accountUiText(t, "확인 중...") : accountUiText(t, "다음")}</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.prompt}>{accountUiText(t, "약관에 동의해 주세요")}</Text>
                <View style={styles.consentList}>
                  <Pressable
                    style={styles.allConsentRow}
                    accessibilityRole="checkbox"
                    accessibilityLabel={accountUiText(t, "전체 동의")}
                    accessibilityState={{ checked: allAccepted }}
                    onPress={handleAllConsentToggle}
                  >
                    <View style={styles.consentCheckboxTouch}>
                      <ConsentMark checked={allAccepted} />
                    </View>
                    <Text style={styles.consentLabel}>{accountUiText(t, "전체 동의")}</Text>
                  </Pressable>
                  <ConsentRow
                    label={accountUiText(t, "[필수] 서비스 이용약관")}
                    checked={termsAccepted}
                    onToggle={() => setTermsAccepted((value) => !value)}
                    onOpenDetails={() => handleConsentDetails('terms')}
                  />
                  <ConsentRow
                    label={accountUiText(t, "[필수] 개인정보 처리방침")}
                    checked={privacyAccepted}
                    onToggle={() => setPrivacyAccepted((value) => !value)}
                    onOpenDetails={() => handleConsentDetails('privacy')}
                  />
                  <ConsentRow
                    label={accountUiText(t, "[선택] 마케팅 정보 수신 동의")}
                    checked={marketingAccepted}
                    onToggle={() => setMarketingAccepted((value) => !value)}
                    onOpenDetails={() => handleConsentDetails('marketing')}
                  />
                </View>
                <Pressable
                  style={[styles.submit, styles.joinButton, (!canJoin || joining) && styles.disabled]}
                  disabled={!canJoin || joining}
                  onPress={() => void handleJoin()}
                >
                  <Text style={styles.submitText}>{joining ? accountUiText(t, "가입 중...") : accountUiText(t, "가입하기")}</Text>
                </Pressable>
                {joinError ? <Text style={styles.error}>{accountUiText(t, joinError)}</Text> : null}
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  layout: { flex: 1, paddingHorizontal: spacing.space16 },
  scrollContent: { flexGrow: 1, paddingBottom: spacing.space24 },
  header: { height: 56, flexDirection: 'row', alignItems: 'center' },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.titleM, color: colors.text, marginLeft: spacing.space8 },
  form: { marginTop: spacing.space40, gap: spacing.space12 },
  prompt: { ...typography.titleM, color: colors.text, marginBottom: spacing.space8 },
  verificationSection: { marginTop: spacing.space24, gap: spacing.space12 },
  codeInputContainer: { position: 'relative' },
  codeInput: { paddingRight: 112 },
  inlineVerifyButton: {
    position: 'absolute',
    right: 0,
    top: 0,
    height: 52,
    paddingHorizontal: spacing.space16,
    justifyContent: 'center',
  },
  inlineVerifyText: { ...typography.label, color: colors.primaryDark },
  inactiveVerifyText: { color: colors.secondaryText },
  verificationOptions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timer: { ...typography.label, color: colors.secondaryText },
  resend: { ...typography.label, color: colors.primaryDark },
  verifiedMessage: { ...typography.titleM, color: colors.text },
  passwordSection: { marginTop: spacing.space32, gap: spacing.space12 },
  passwordHint: { ...typography.caption, color: colors.secondaryText },
  nicknameHint: { ...typography.caption, color: colors.secondaryText },
  nicknameAvailable: { ...typography.caption, color: colors.primaryDark },
  consentList: { marginTop: spacing.space12, gap: spacing.space4 },
  allConsentRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center' },
  consentRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center' },
  consentCheckboxTouch: { width: 44, minHeight: 56, alignItems: 'center', justifyContent: 'center' },
  consentMark: {
    width: 22,
    height: 22,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.radius4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  consentMarkChecked: { borderColor: colors.primary, backgroundColor: colors.primary },
  consentDetails: { flex: 1, minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  consentLabel: { ...typography.body, color: colors.text, flexShrink: 1 },
  joinButton: { marginTop: spacing.space24 },
  error: { ...typography.caption, color: '#B91C1C' },
  input: {
    height: 52,
    paddingHorizontal: spacing.space16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.radius8,
    color: colors.text,
    ...typography.body,
  },
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
});

