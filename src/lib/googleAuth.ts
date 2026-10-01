import { API_BASE_URL } from '../constants/api';
import { DEVICE_ID } from './auth';

export type PopkuTokens = { accessToken: string; refreshToken: string };
export type GoogleAuthResult =
  | { kind: 'existing'; tokens: PopkuTokens }
  | { kind: 'signup'; signupToken: string; expiresInSeconds: number };

export type GoogleCompleteRequest = {
  signupToken: string;
  nickname: string;
  consents: { termsOfService: boolean; privacyPolicy: boolean; marketing: boolean };
  deviceId: string;
};

export class GoogleAuthApiError extends Error {
  constructor(readonly status: number, readonly code: string | null, readonly reason: string | null) {
    super('Google authentication request failed');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseTokens(value: unknown): PopkuTokens {
  if (!isRecord(value) || typeof value.accessToken !== 'string' || !value.accessToken
    || typeof value.refreshToken !== 'string' || !value.refreshToken) {
    throw new Error('로그인 응답을 확인하지 못했어요. 다시 시도해 주세요.');
  }
  return { accessToken: value.accessToken, refreshToken: value.refreshToken };
}

async function errorFromResponse(response: Response): Promise<GoogleAuthApiError> {
  const body = await response.text().catch(() => '');
  let code: string | null = null;
  try {
    const parsed: unknown = JSON.parse(body);
    if (isRecord(parsed) && typeof parsed.error === 'string') code = parsed.error;
  } catch {
    // ResponseStatusException may be returned as text or HTML.
  }
  const reasons = [
    'Invalid Google signup token', 'Invalid nickname', 'Required consent is missing',
    'Email already registered', 'Nickname already used', 'Email or nickname already used',
  ];
  return new GoogleAuthApiError(response.status, code, reasons.find((reason) => body.includes(reason)) ?? null);
}

export async function authenticateWithGoogle(idToken: string): Promise<GoogleAuthResult> {
  const response = await fetch(`${API_BASE_URL}/api/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken, deviceId: DEVICE_ID }),
  });
  if (!response.ok) throw await errorFromResponse(response);
  const body: unknown = await response.json();
  if (isRecord(body) && body.status === 'SIGNUP_REQUIRED'
    && typeof body.signupToken === 'string' && body.signupToken
    && typeof body.expiresInSeconds === 'number' && body.expiresInSeconds > 0) {
    return { kind: 'signup', signupToken: body.signupToken, expiresInSeconds: body.expiresInSeconds };
  }
  return { kind: 'existing', tokens: parseTokens(body) };
}

export async function completeGoogleSignup(request: GoogleCompleteRequest): Promise<PopkuTokens> {
  const response = await fetch(`${API_BASE_URL}/api/auth/google/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw await errorFromResponse(response);
  return parseTokens(await response.json());
}

let signupSession: { token: string; expiresAt: number } | null = null;

export function beginGoogleSignup(token: string, expiresInSeconds: number): void {
  signupSession = { token, expiresAt: Date.now() + expiresInSeconds * 1000 };
}

export function getGoogleSignupToken(): string | null {
  return signupSession && signupSession.expiresAt > Date.now() ? signupSession.token : null;
}

export function clearGoogleSignup(): void {
  signupSession = null;
}

export async function getGoogleIdToken(): Promise<string | null> {
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
  if (__DEV__) console.info('[GOOGLE] signin starting, web client ID configured:', !!webClientId);
  if (!webClientId) throw new Error('Google 로그인 설정을 확인해 주세요.');
  // Load the native module on demand so the existing LOCAL login stays available before a dev-client rebuild.
  const { GoogleOneTapSignIn, isCancelledResponse, isNoSavedCredentialFoundResponse, isSuccessResponse } =
    await import('react-native-nitro-google-signin');
  if (__DEV__) console.info('[GOOGLE] native module loaded');
  GoogleOneTapSignIn.configure({ webClientId });
  if (__DEV__) console.info('[GOOGLE] configure complete');
  await GoogleOneTapSignIn.checkPlayServices();
  if (__DEV__) console.info('[GOOGLE] signin starting: saved credentials');
  let response = await GoogleOneTapSignIn.signIn();
  if (__DEV__) console.info('[GOOGLE] native response:', { flow: 'signIn', type: response.type });
  if (isNoSavedCredentialFoundResponse(response)) {
    if (__DEV__) console.info('[GOOGLE] account picker starting');
    response = await GoogleOneTapSignIn.createAccount();
    if (__DEV__) console.info('[GOOGLE] native response:', { flow: 'createAccount', type: response.type });
  }
  if (isNoSavedCredentialFoundResponse(response)) {
    response = await GoogleOneTapSignIn.presentExplicitSignIn();
    if (__DEV__) console.info('[GOOGLE] native response:', { flow: 'presentExplicitSignIn', type: response.type });
  }
  if (isCancelledResponse(response)) {
    if (__DEV__) console.info('[GOOGLE] signin cancelled');
    return null;
  }
  if (!isSuccessResponse(response) || !response.data.idToken) {
    throw new Error('Google 인증 정보를 받지 못했어요. 다시 시도해 주세요.');
  }
  if (__DEV__) console.info('[GOOGLE] signin success');
  return response.data.idToken;
}
