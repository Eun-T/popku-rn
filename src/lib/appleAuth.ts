import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';
import { API_BASE_URL } from '../constants/api';
import { getDeviceId } from './auth';

type AppTokens = { accessToken: string; refreshToken: string };
export type AppleAuthResult =
  | { kind: 'existing'; tokens: AppTokens }
  | { kind: 'signup'; signupToken: string; expiresInSeconds: number };
type CompleteRequest = {
  ageConfirmed: boolean;
  signupToken: string;
  nickname: string;
  consents: { termsOfService: boolean; privacyPolicy: boolean; marketing: boolean };
  deviceId: string;
};

export class AppleAuthError extends Error {
  constructor(readonly code: string, readonly status?: number) {
    // Never retain server messages or native errors that may contain credentials.
    super('Apple authentication failed');
  }
}
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const duration = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

async function post(path: string, body?: object): Promise<unknown> {
  const response = await fetch(`${API_BASE_URL}/api/auth/apple${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const allowed = ['bad_request', 'unauthorized', 'apple_email_required', 'email_already_registered',
      'signup_conflict', 'apple_verification_unavailable'];
    throw new AppleAuthError(record(data) && typeof data.error === 'string' && allowed.includes(data.error)
      ? data.error : 'request_failed', response.status);
  }
  return data;
}
function tokens(data: unknown): AppTokens {
  if (!record(data) || !nonempty(data.accessToken) || !nonempty(data.refreshToken)) {
    throw new AppleAuthError('token_missing');
  }
  return { accessToken: data.accessToken, refreshToken: data.refreshToken };
}

export async function isAppleAuthenticationAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try { return await AppleAuthentication.isAvailableAsync(); }
  catch { return false; }
}

export async function authenticateWithApple(isActive: () => boolean = () => true): Promise<AppleAuthResult | null> {
  if (!isActive()) return null;
  const available = await isAppleAuthenticationAvailable();
  if (!isActive()) return null;
  if (!available) throw new AppleAuthError('unavailable');
  const challenge = await post('/challenge');
  if (!isActive()) return null;
  if (!record(challenge) || !nonempty(challenge.challengeId) || !nonempty(challenge.nonce)
    || !duration(challenge.expiresInSeconds)) throw new AppleAuthError('token_missing');
  const expiresAt = Date.now() + challenge.expiresInSeconds * 1000;
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      nonce: challenge.nonce,
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
    });
  } catch (error) {
    if (record(error) && error.code === 'ERR_REQUEST_CANCELED') return null;
    throw new AppleAuthError('native_failed');
  }
  if (!isActive()) return null;
  if (Date.now() >= expiresAt) throw new AppleAuthError('challenge_expired');
  if (!nonempty(credential.identityToken)) throw new AppleAuthError('token_missing');
  const result = await post('', {
    identityToken: credential.identityToken, authorizationCode: credential.authorizationCode,
    challengeId: challenge.challengeId, deviceId: await getDeviceId(),
  });
  if (!isActive()) return null;
  if (record(result) && result.status === 'SIGNUP_REQUIRED') {
    if (!nonempty(result.signupToken) || !duration(result.expiresInSeconds)) throw new AppleAuthError('token_missing');
    return { kind: 'signup', signupToken: result.signupToken, expiresInSeconds: result.expiresInSeconds };
  }
  return { kind: 'existing', tokens: tokens(result) };
}

export async function completeAppleSignup(request: CompleteRequest): Promise<AppTokens> {
  return tokens(await post('/complete', request));
}
let signupSession: { token: string; expiresAt: number } | null = null;
export function beginAppleSignup(token: string, expiresInSeconds: number): void {
  signupSession = { token, expiresAt: Date.now() + expiresInSeconds * 1000 };
}
export function getAppleSignupToken(): string | null {
  if (signupSession && signupSession.expiresAt > Date.now()) return signupSession.token;
  signupSession = null;
  return null;
}
export function clearAppleSignup(): void { signupSession = null; }

export function appleLoginErrorMessage(error: unknown): string {
  if (error instanceof TypeError) return '네트워크 연결을 확인하고 다시 시도해 주세요.';
  if (error instanceof AppleAuthError) {
    if (error.code === 'unavailable') return '이 기기에서는 Apple 로그인을 사용할 수 없어요.';
    if (error.code === 'token_missing') return 'Apple 인증 정보를 받지 못했어요. 다시 시도해 주세요.';
    if (error.code === 'apple_email_required') return 'Apple에서 확인된 이메일을 받지 못했어요. 이메일 공유를 확인하고 다시 시도해 주세요.';
    if (error.code === 'email_already_registered') return '이미 이메일로 가입된 계정이 있어요.\n기존 로그인 방법으로 로그인해 주세요.';
    if (error.status === 401 || error.code === 'challenge_expired') return 'Apple 인증이 만료되었거나 유효하지 않아요. 다시 로그인해 주세요.';
  }
  return 'Apple 로그인에 실패했어요. 다시 시도해 주세요.';
}
export function appleSignupErrorMessage(error: unknown): string {
  if (error instanceof TypeError) return '네트워크 연결을 확인하고 다시 시도해 주세요.';
  if (error instanceof AppleAuthError) {
    if (error.status === 401) return 'Apple 가입 시간이 만료됐어요. 다시 로그인해 주세요.';
    if (error.status === 409) return '이메일 또는 닉네임이 이미 사용 중이에요.';
    if (error.status === 400) return '닉네임과 필수 약관 동의를 확인해 주세요.';
  }
  return 'Apple 가입을 완료하지 못했어요. 다시 시도해 주세요.';
}
