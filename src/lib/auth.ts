import * as SecureStore from 'expo-secure-store';

import { API_BASE_URL } from '../constants/api';
import { clearFavoriteCache } from './favoriteCache';
import { clearCommunityLikes } from './communityFeedRefresh';

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
  id?: number;
  nickname: string;
  email: string;
  provider?: string;
};

let authUser: CurrentUser | null = null;
const authUserListeners = new Set<() => void>();
const authSessionListeners = new Set<() => void>();
let publishedGeneration = 0;
let authGeneration = 0;
let tokenWrites: Promise<void> = Promise.resolve();
let invalidation: { generation: number; nextGeneration: number; result: Promise<boolean> } | undefined;

// Serialize SecureStore mutations so an already-started delete cannot erase a later login.
function writeTokens<T>(operation: () => Promise<T>): Promise<T> {
  const result = tokenWrites.then(operation);
  tokenWrites = result.then(() => {}, () => {});
  return result;
}

export async function getAuthSession(): Promise<{ accessToken: string | null; generation: number }> {
  for (;;) {
    const generation = authGeneration;
    const accessToken = await getSavedAccessToken();
    if (generation === authGeneration) return { accessToken, generation };
  }
}

export function getAuthUser(): CurrentUser | null {
  return authUser;
}

export function authSessionGeneration(): number { return authGeneration; }

export function subscribeAuthUser(listener: () => void): () => void {
  authUserListeners.add(listener);
  return () => { authUserListeners.delete(listener); };
}

export function setAuthUser(user: CurrentUser | null): void {
  const identityChanged = authUser?.email !== user?.email;
  const sessionChanged = identityChanged || publishedGeneration !== authGeneration;
  const dataChanged = identityChanged || authUser?.nickname !== user?.nickname || authUser?.provider !== user?.provider;
  if (identityChanged) { clearFavoriteCache(); clearCommunityLikes(); }
  publishedGeneration = authGeneration;
  if (!dataChanged && !sessionChanged) return;
  authUser = user;
  authUserListeners.forEach((listener) => listener());
  if (sessionChanged) authSessionListeners.forEach((listener) => listener());
}

export function subscribeAuthSession(listener: () => void): () => void {
  authSessionListeners.add(listener);
  return () => { authSessionListeners.delete(listener); };
}

export class CurrentUserError extends Error {
  constructor(readonly status: number) { super('사용자 정보를 불러오지 못했습니다.'); }
}

/** A profile read cannot invalidate or overwrite a newer login. */
export async function refreshAuthUser(isActive: () => boolean = () => true): Promise<void> {
  const session = await getAuthSession();
  try {
    const user = session.accessToken ? await getCurrentUser(session.accessToken) : null;
    if (isActive() && session.generation === authGeneration) setAuthUser(user);
  } catch (error) {
    if (error instanceof CurrentUserError && error.status === 401) {
      await clearTokens(session.generation);
      return;
    }
    throw error;
  }
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
    throw new CurrentUserError(response.status);
  }
  return response.json();
}

/** Only 204 confirms withdrawal. The caller clears this session after success. */
export async function withdrawAccount(): Promise<number> {
  const { accessToken, generation } = await getAuthSession();
  if (!accessToken) throw new CurrentUserError(401);
  const response = await fetch(`${API_BASE_URL}/api/users/me`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status !== 204) {
    await logHttpFailure('withdrawal error response', response);
    throw new Error('회원탈퇴에 실패했습니다. 다시 시도해주세요.');
  }
  // No JSON body, logout request, or local invalidation on a failed DELETE.
  return generation;
}

export async function saveTokens(tokens: LoginResponse): Promise<void> {
  authGeneration += 1;
  clearFavoriteCache();
  clearCommunityLikes();
  await writeTokens(async () => {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken);
    try {
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken);
    } catch (error) {
      await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
      throw error;
    }
  });
}

export async function getSavedAccessToken(): Promise<string | null> {
  await tokenWrites;
  // SecureStore has no Web implementation; public reads can continue without a token.
  if (!await SecureStore.isAvailableAsync()) return null;
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export async function logout(): Promise<void> {
  const generation = authGeneration;
  try {
    const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    // A delayed read must not send a newer session's refresh token to logout.
    if (generation !== authGeneration) return;
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
      await clearTokens(generation);
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

export function clearTokens(expectedGeneration?: number): Promise<boolean> {
  if (expectedGeneration !== undefined) {
    if (invalidation?.generation === expectedGeneration && authGeneration === invalidation.nextGeneration) {
      return invalidation.result;
    }
    if (expectedGeneration !== authGeneration) return Promise.resolve(false);
  }
  const generation = authGeneration++;
  const nextGeneration = authGeneration;
  clearFavoriteCache();
  clearCommunityLikes();
  const result = writeTokens(async () => {
    const results = await Promise.allSettled([
      SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    ]);
    if (authGeneration === nextGeneration) setAuthUser(null);
    const failure = results.find((item) => item.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
    return authGeneration === nextGeneration;
  });
  invalidation = { generation, nextGeneration, result };
  return result;
}
