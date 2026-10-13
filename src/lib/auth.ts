import * as SecureStore from 'expo-secure-store';

import { API_BASE_URL, API_TOKEN_STORAGE_NAMESPACE } from '../constants/api';
import { clearFavoriteCache } from './favoriteCache';
import { clearCommunityLikes } from './communityFeedRefresh';
import { getDeviceId } from './deviceId';
export { getDeviceId } from './deviceId';

const ACCESS_TOKEN_KEY = API_TOKEN_STORAGE_NAMESPACE ? `${API_TOKEN_STORAGE_NAMESPACE}.accessToken` : 'accessToken';
const REFRESH_TOKEN_KEY = API_TOKEN_STORAGE_NAMESPACE ? `${API_TOKEN_STORAGE_NAMESPACE}.refreshToken` : 'refreshToken';
const SESSION_KEY = API_TOKEN_STORAGE_NAMESPACE ? `${API_TOKEN_STORAGE_NAMESPACE}.session.v1` : 'session.v1';
const SIGNED_OUT_SESSION = '{"signedOut":true}';
const LEGACY_DEVICE_ID = 'android-emulator-dev';
// BE cannot rebind an issued token. Only existing sessions retain this ID, for a bounded window.
const LEGACY_COMPATIBILITY_MS = 7 * 24 * 60 * 60 * 1000;
type StoredSession = { accessToken: string; refreshToken: string; deviceId: string; legacyUntil?: number; installationDeviceId?: string };
type AuthSession = { accessToken: string | null; generation: number };
type RefreshFlight = { generation: number; result: Promise<string | null> };
let refreshFlight: RefreshFlight | undefined;
let failedRefresh: { generation: number; accessToken: string } | undefined;
let tokensInvalidated = false;
const retriedResponses = new WeakSet<Response>();
export function wasAuthRetried(response: Response): boolean { return retriedResponses.has(response); }

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
export type AuthStatus = 'restoring' | 'authenticated' | 'anonymous' | 'error';
let authStatus: AuthStatus = 'restoring';
const authStatusListeners = new Set<() => void>();
let initialization: Promise<void> | undefined;
let currentUserRequest: { generation: number; accessToken: string; result: Promise<CurrentUser> } | undefined;
const authUserListeners = new Set<() => void>();
const authSessionListeners = new Set<() => void>();
const sessionInvalidationListeners = new Set<() => void>();
let publishedGeneration = 0;
let authGeneration = 0;
let loggingOutGeneration: number | undefined;
let sessionRevision = 0;
export function authSessionRevision(): number { return sessionRevision; }
function invalidateSessionWork(): void {
  sessionRevision += 1;
  sessionInvalidationListeners.forEach(listener => listener());
}
let tokenWrites: Promise<void> = Promise.resolve();
let invalidation: { generation: number; nextGeneration: number; result: Promise<boolean> } | undefined;

// Serialize SecureStore mutations so an already-started delete cannot erase a later login.
function writeTokens<T>(operation: () => Promise<T>): Promise<T> {
  const result = tokenWrites.then(operation);
  tokenWrites = result.then(() => {}, () => {});
  return result;
}

export async function getAuthSession(): Promise<AuthSession> {
  const generation = authGeneration;
  const accessToken = await getSavedAccessToken();
  // Work begun by A must not silently acquire B's credentials during a delayed storage read.
  return { accessToken: isAuthSessionCurrent(generation) ? accessToken : null, generation };
}

export function getAuthUser(): CurrentUser | null {
  return authUser;
}

export function getAuthStatus(): AuthStatus { return authStatus; }

export function subscribeAuthStatus(listener: () => void): () => void {
  authStatusListeners.add(listener);
  return () => { authStatusListeners.delete(listener); };
}

function setAuthStatus(status: AuthStatus): void {
  if (authStatus === status) return;
  authStatus = status;
  authStatusListeners.forEach((listener) => listener());
}

/** Shared across root remounts. Explicit retries use refreshAuthUser instead. */
export function initializeAuth(): Promise<void> {
  return initialization ??= authStatus === 'restoring' || authStatus === 'error'
    ? refreshAuthUser().catch(() => {})
    : Promise.resolve();
}

export function authSessionGeneration(): number { return authGeneration; }

// Submission work must stop at invalidation, before SecureStore or /me completes.
export function isAuthSessionCurrent(generation: number): boolean {
  return generation === authGeneration && generation !== loggingOutGeneration;
}
export function subscribeAuthSessionInvalidation(listener: () => void): () => void {
  sessionInvalidationListeners.add(listener);
  return () => { sessionInvalidationListeners.delete(listener); };
}

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
  if (dataChanged || sessionChanged) authUser = user;
  setAuthStatus(user ? 'authenticated' : 'anonymous');
  if (!dataChanged && !sessionChanged) return;
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

/** A restoration cannot invalidate or overwrite a newer login or logout. */
export async function refreshAuthUser(isActive: () => boolean = () => true): Promise<void> {
  const generation = authGeneration;
  const canPublish = () => isActive() && generation === authGeneration && generation !== loggingOutGeneration;
  if (authStatus === 'error') failedRefresh = undefined;
  try {
    const session = await getAuthSession();
    if (!canPublish()) return;
    setAuthStatus('restoring');
    const user = session.accessToken ? await getCurrentUser(session.accessToken) : null;
    if (canPublish()) setAuthUser(user);
  } catch (error) {
    if (error instanceof CurrentUserError && error.status === 401) {
      await clearTokens(generation);
      return;
    }
    if (canPublish()) setAuthStatus('error');
    throw error;
  }
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  if (__DEV__) console.info('[AUTH] login request');
  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, deviceId: await getDeviceId() }),
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

export function getCurrentUser(accessToken: string): Promise<CurrentUser> {
  const generation = authGeneration;
  if (currentUserRequest?.generation === generation && currentUserRequest.accessToken === accessToken) {
    return currentUserRequest.result;
  }
  const request = { generation, accessToken, result: fetchCurrentUser(accessToken) };
  currentUserRequest = request;
  const release = () => { if (currentUserRequest === request) currentUserRequest = undefined; };
  void request.result.then(release, release);
  return request.result;
}

async function fetchCurrentUser(accessToken: string): Promise<CurrentUser> {
  if (__DEV__) console.info('[AUTH] /me request');
  const response = await authenticatedFetch(`${API_BASE_URL}/api/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  }, { accessToken, generation: authGeneration });

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
  const response = await authenticatedFetch(`${API_BASE_URL}/api/users/me`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  }, { accessToken, generation });
  if (response.status !== 204) {
    await logHttpFailure('withdrawal error response', response);
    throw new Error('회원탈퇴에 실패했습니다. 다시 시도해주세요.');
  }
  // No JSON body, logout request, or local invalidation on a failed DELETE.
  return generation;
}

export async function saveTokens(tokens: LoginResponse): Promise<void> {
  authGeneration += 1;
  tokensInvalidated = true;
  invalidateSessionWork();
  setAuthStatus('restoring');
  clearFavoriteCache();
  clearCommunityLikes();
  const generation = authGeneration;
  try {
    const deviceId = await getDeviceId();
    if (typeof tokens.accessToken !== 'string' || !tokens.accessToken
      || typeof tokens.refreshToken !== 'string' || !tokens.refreshToken) throw new Error('Incomplete authentication tokens');
    if (!await persistSession({ ...tokens, deviceId }, generation)) throw new Error('Authentication session changed');
    if (!isAuthSessionCurrent(generation)) throw new Error('Authentication session changed');
    tokensInvalidated = false;
  } catch (error) {
    await clearTokens(generation).catch(() => {});
    throw error;
  }
}

function parseSession(raw: string): StoredSession {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('Invalid saved authentication session'); }
  if (!value || typeof value !== 'object' || !('accessToken' in value) || typeof value.accessToken !== 'string' || !value.accessToken
    || !('refreshToken' in value) || typeof value.refreshToken !== 'string' || !value.refreshToken
    || !('deviceId' in value) || typeof value.deviceId !== 'string' || !value.deviceId
    || ('legacyUntil' in value && (typeof value.legacyUntil !== 'number' || !Number.isFinite(value.legacyUntil)))
    || ('installationDeviceId' in value && typeof value.installationDeviceId !== 'string')
    || (value.deviceId === LEGACY_DEVICE_ID && !('legacyUntil' in value))) throw new Error('Invalid saved authentication session');
  return value as StoredSession;
}

async function readSession(): Promise<StoredSession | null> {
  await tokenWrites;
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  if (raw === SIGNED_OUT_SESSION) return null;
  if (raw) return parseSession(raw);
  const accessToken = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  return accessToken && refreshToken
    ? { accessToken, refreshToken, deviceId: LEGACY_DEVICE_ID,
      installationDeviceId: await getDeviceId(), legacyUntil: Date.now() + LEGACY_COMPATIBILITY_MS }
    : null;
}

function persistSession(session: StoredSession, generation: number): Promise<boolean> {
  return writeTokens(async () => {
    if (!isAuthSessionCurrent(generation)) return false;
    // One authoritative value makes rotation atomic; never read a mixed token pair.
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
    await Promise.all([ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY].map(async key => {
      if (await SecureStore.getItemAsync(key) !== null) await SecureStore.deleteItemAsync(key);
    }));
    return isAuthSessionCurrent(generation);
  });
}

export async function getSavedAccessToken(): Promise<string | null> {
  const generation = authGeneration;
  await tokenWrites;
  if (tokensInvalidated || !isAuthSessionCurrent(generation)) return null;
  // SecureStore has no Web implementation; public reads can continue without a token.
  if (!await SecureStore.isAvailableAsync()) return null;
  const session = await SecureStore.getItemAsync(SESSION_KEY);
  if (session === SIGNED_OUT_SESSION) return null;
  if (session) {
    let stored: StoredSession;
    try { stored = parseSession(session); }
    catch { await clearTokens(generation).catch(() => {}); return null; }
    if ((stored.installationDeviceId ?? stored.deviceId) !== await getDeviceId()) {
      await clearTokens(generation);
      return null;
    }
    return isAuthSessionCurrent(generation) ? stored.accessToken : null;
  }
  const accessToken = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  return isAuthSessionCurrent(generation) ? accessToken : null;
}

/** Inspect only expiry for retry eligibility; this is never trusted for authentication. */
function accessTokenExpired(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || !parts[1]) return false;
    // Decode just the JWT payload without depending on a browser atob global on iOS.
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let bits = 0, buffer = 0, payload = '';
    for (const character of parts[1].replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '')) {
      const value = alphabet.indexOf(character);
      if (value < 0) return false;
      buffer = (buffer << 6) | value;
      bits += 6;
      if (bits >= 8) { bits -= 8; payload += String.fromCharCode((buffer >> bits) & 255); }
    }
    const data: unknown = JSON.parse(payload);
    return !!data && typeof data === 'object' && 'exp' in data && typeof data.exp === 'number'
      && Number.isFinite(data.exp) && data.exp <= Date.now() / 1000;
  } catch { return false; }
}

async function revokeSession(session: StoredSession): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ refreshToken: session.refreshToken, deviceId: session.deviceId }),
    });
    if (!response.ok) throw new Error('서버 로그아웃에 실패했습니다.');
  } finally { clearTimeout(timeout); }
}

async function rotateSession(generation: number, failedToken: string): Promise<string | null> {
  let rotated: StoredSession | undefined;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const session = await readSession();
    if (!isAuthSessionCurrent(generation)) return null;
    if (!session) { await clearTokens(generation); return null; }
    if (session.accessToken !== failedToken) return session.accessToken;
    if (session.legacyUntil !== undefined && session.legacyUntil <= Date.now()) {
      await revokeSession(session).catch(() => {});
      await clearTokens(generation);
      return null;
    }
    // Persist the legacy deadline before any rotation so restarts cannot extend it.
    if (!await persistSession(session, generation)) return null;
    const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ refreshToken: session.refreshToken, deviceId: session.deviceId }),
    });
    if (!response.ok) {
      if (response.status === 400 || response.status === 401 || response.status === 403) await clearTokens(generation);
      throw new Error('Authentication renewal failed');
    }
    const tokens: unknown = await response.json().catch(() => null);
    if (!tokens || typeof tokens !== 'object' || !('accessToken' in tokens) || typeof tokens.accessToken !== 'string' || !tokens.accessToken
      || !('refreshToken' in tokens) || typeof tokens.refreshToken !== 'string' || !tokens.refreshToken
      || tokens.refreshToken === session.refreshToken || ('deviceId' in tokens && tokens.deviceId !== session.deviceId)) {
      if (tokens && typeof tokens === 'object' && 'refreshToken' in tokens
        && typeof tokens.refreshToken === 'string' && tokens.refreshToken && tokens.refreshToken !== session.refreshToken) {
        await revokeSession({ ...session, refreshToken: tokens.refreshToken }).catch(() => {});
      }
      await clearTokens(generation);
      throw new Error('Invalid authentication renewal response');
    }
    rotated = { ...session, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
    if (!isAuthSessionCurrent(generation)) { await revokeSession(rotated).catch(() => {}); return null; }
    if (!await persistSession(rotated, generation)) { await revokeSession(rotated).catch(() => {}); return null; }
    return rotated.accessToken;
  } catch (error) {
    if (rotated) {
      await revokeSession(rotated).catch(() => {});
      await clearTokens(generation).catch(() => {});
    }
    if (isAuthSessionCurrent(generation)) {
      failedRefresh = { generation, accessToken: failedToken };
      setAuthStatus('error');
    }
    throw error;
  } finally { clearTimeout(timeout); }
}

function refreshAccessToken(session: AuthSession): Promise<string | null> {
  if (!session.accessToken || !isAuthSessionCurrent(session.generation)) return Promise.resolve(null);
  if (refreshFlight?.generation === session.generation) return refreshFlight.result;
  if (failedRefresh?.generation === session.generation && failedRefresh.accessToken === session.accessToken) {
    return Promise.reject(new Error('Authentication renewal failed; retry authentication restoration'));
  }
  const flight = { generation: session.generation, result: rotateSession(session.generation, session.accessToken) };
  refreshFlight = flight;
  const release = () => { if (refreshFlight === flight) refreshFlight = undefined; };
  void flight.result.then(release, release);
  return flight.result;
}

/** Authenticated requests alone participate; public requests and OAuth keep their existing behavior. */
export async function authenticatedFetch(url: string, init: RequestInit, session: AuthSession,
  anonymousFallback = false): Promise<Response> {
  if (session.accessToken && !isAuthSessionCurrent(session.generation)) throw new Error('Authentication session changed');
  const response = await fetch(url, init);
  if (!session.accessToken || response.status !== 401 || init.signal?.aborted) return response;
  if (!isAuthSessionCurrent(session.generation) && !anonymousFallback) return response;
  let token: string | null = null;
  if (isAuthSessionCurrent(session.generation) && accessTokenExpired(session.accessToken)) {
    const failure: unknown = await response.clone().json().catch(() => null);
    if (failure && typeof failure === 'object' && 'error' in failure && failure.error === 'invalid_access_token') {
      if (init.signal?.aborted) return response;
      try { token = await refreshAccessToken(session); }
      catch (error) { if (isAuthSessionCurrent(session.generation)) throw error; }
    }
  }
  if (init.signal?.aborted) return response;
  if (!token) {
    if (!anonymousFallback) return response;
    await clearTokens(session.generation);
    // Public reads retain their existing fallback, without invalidating a newer login.
    token = (await getAuthSession()).accessToken;
  } else if (!isAuthSessionCurrent(session.generation)) return response;
  const fields = new Headers(init.headers);
  fields.delete('Authorization');
  const headers: Record<string, string> = {};
  fields.forEach((value, key) => { headers[key] = value; });
  if (token) headers.Authorization = `Bearer ${token}`;
  // No recursion: at most one replay, always in the original session generation.
  const retry = await fetch(url, { ...init, headers: Object.keys(headers).length ? headers : undefined });
  retriedResponses.add(retry);
  if (retry.status === 401 && token && isAuthSessionCurrent(session.generation)) await clearTokens(session.generation);
  return retry;
}

export async function logout(): Promise<void> {
  const generation = authGeneration;
  // A restoration must stop publishing as soon as logout starts, including
  // while the server logout or refresh-token read is still pending.
  if (loggingOutGeneration !== generation) {
    loggingOutGeneration = generation;
    invalidateSessionWork();
  }
  try {
    const flight = refreshFlight?.generation === generation ? refreshFlight : undefined;
    const session = await readSession();
    // A delayed read must not send a newer session's refresh token to logout.
    if (generation !== authGeneration) return;
    if (session) {
      await revokeSession(session);
    } else if (__DEV__) {
      console.info('[AUTH] logout request skipped: refresh token missing');
    }
    // In-flight rotation owns compensating revocation of its late response.
    // Do not wait here: an unavailable refresh server must not prevent local logout.
    void flight?.result.catch(() => {});
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
  tokensInvalidated = true;
  invalidateSessionWork();
  const nextGeneration = authGeneration;
  clearFavoriteCache();
  clearCommunityLikes();
  const result = writeTokens(async () => {
    const results = await Promise.allSettled([
      SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
      SecureStore.deleteItemAsync(SESSION_KEY),
    ]);
    const failure = results.find((item) => item.status === 'rejected');
    if (failure && authGeneration === nextGeneration) {
      // A failed delete must not make a retained token (or legacy fallback) restore on restart.
      await SecureStore.setItemAsync(SESSION_KEY, SIGNED_OUT_SESSION).catch(() => {});
    }
    if (authGeneration === nextGeneration) setAuthUser(null);
    if (failure?.status === 'rejected') throw failure.reason;
    return authGeneration === nextGeneration;
  });
  invalidation = { generation, nextGeneration, result };
  return result;
}
