import * as SecureStore from 'expo-secure-store';

import { API_BASE_URL } from '../constants/api';

const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';
export const DEVICE_ID = 'android-emulator-dev';

async function logHttpFailure(step: string, response: Response): Promise<void> {
  if (!__DEV__) return;
  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = await response.clone().json();
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const fields = parsed as Record<string, unknown>;
      body = { error: fields.error, message: fields.message, detail: fields.detail };
    }
  } catch {
    // The error response may have no JSON body.
  }
  console.info('[AUTH]', step, { status: response.status, body });
}

type LoginResponse = {
  accessToken: string;
  refreshToken: string;
};

export type CurrentUser = {
  nickname: string;
  email: string;
};

let authUser: CurrentUser | null = null;
const authUserListeners = new Set<() => void>();

export function getAuthUser(): CurrentUser | null {
  return authUser;
}

export function subscribeAuthUser(listener: () => void): () => void {
  authUserListeners.add(listener);
  return () => { authUserListeners.delete(listener); };
}

export function setAuthUser(user: CurrentUser | null): void {
  authUser = user;
  authUserListeners.forEach((listener) => listener());
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  if (__DEV__) console.info('[AUTH] login request');
  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, deviceId: DEVICE_ID }),
  });

  if (__DEV__) console.info('[AUTH] login response:', response.status);
  if (!response.ok) {
    await logHttpFailure('login error response', response);
    throw new Error('이메일 또는 비밀번호를 확인해 주세요.');
  }

  const tokens: LoginResponse = await response.json();
  if (!tokens.accessToken || !tokens.refreshToken) {
    throw new Error('로그인 응답에 토큰이 없습니다.');
  }
  return tokens;
}

export async function getCurrentUser(accessToken: string): Promise<CurrentUser> {
  if (__DEV__) console.info('[AUTH] /me request');
  const response = await fetch(`${API_BASE_URL}/api/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (__DEV__) console.info('[AUTH] /me response:', response.status);
  if (!response.ok) {
    await logHttpFailure('/me error response', response);
    throw new Error('사용자 정보를 불러오지 못했습니다.');
  }
  return response.json();
}

export async function saveTokens(tokens: LoginResponse): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken);
  try {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken);
  } catch (error) {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
    throw error;
  }
}

export function getSavedAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export async function logout(): Promise<void> {
  try {
    const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    if (refreshToken) {
      if (__DEV__) console.info('[AUTH] logout request', { refreshTokenPresent: true, deviceIdPresent: !!DEVICE_ID });
      const response = await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken, deviceId: DEVICE_ID }),
      });
      if (__DEV__) console.info('[AUTH] logout response:', response.status);
      if (!response.ok) {
        await logHttpFailure('logout response', response);
        throw new Error('서버 로그아웃에 실패했습니다.');
      }
    } else if (__DEV__) {
      console.info('[AUTH] logout request skipped: refresh token missing');
    }
  } catch (cause) {
    if (__DEV__) console.info('[AUTH] logout error:', cause instanceof Error ? cause.message : 'unknown error');
    throw cause;
  } finally {
    try {
      await clearTokens();
    } finally {
      if (__DEV__) {
        const [accessToken, refreshToken] = await Promise.allSettled([
          SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
          SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
        ]);
        console.info('[AUTH] access token removed:', accessToken.status === 'fulfilled' && accessToken.value === null);
        console.info('[AUTH] refresh token removed:', refreshToken.status === 'fulfilled' && refreshToken.value === null);
        console.info('[AUTH] user state cleared:', getAuthUser() === null);
      }
    }
  }
}

export async function clearTokens(): Promise<void> {
  const results = await Promise.allSettled([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
  ]);
  setAuthUser(null);
  const failure = results.find((result) => result.status === 'rejected');
  if (failure?.status === 'rejected') throw failure.reason;
}
