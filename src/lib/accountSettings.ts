import { API_BASE_URL } from '../constants/api';
import { getAuthSession, getAuthUser, setAuthUser, type CurrentUser } from './auth';

export class AccountSettingsError extends Error {
  constructor(readonly status: number, readonly reason: string | null, readonly authGeneration: number) {
    super('Account settings request failed');
  }
}

async function patch(path: 'nickname' | 'password', body: object, signal: AbortSignal) {
  const { accessToken, generation } = await getAuthSession();
  if (signal.aborted) throw new Error('Account settings request cancelled');
  if (!accessToken) throw new AccountSettingsError(401, null, generation);
  const response = await fetch(`${API_BASE_URL}/api/users/me/${path}`, {
    method: 'PATCH', signal,
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    // Only retain known, constant messages; never log request or response bodies.
    const failure: unknown = await response.json().catch(() => null);
    const reasons = ['Current password incorrect', 'Password does not meet policy', 'Password confirmation mismatch',
      'New password must be different', 'Password change unavailable for social account'];
    const reason = failure && typeof failure === 'object' && 'error' in failure
      && typeof failure.error === 'string' && reasons.includes(failure.error) ? failure.error : null;
    throw new AccountSettingsError(response.status, reason, generation);
  }
  return { response, generation };
}

export async function updateMyNickname(nickname: string, signal: AbortSignal): Promise<CurrentUser> {
  const email = getAuthUser()?.email;
  const { response, generation } = await patch('nickname', { nickname }, signal);
  const user: unknown = await response.json();
  if (!user || typeof user !== 'object' || !('nickname' in user) || typeof user.nickname !== 'string'
    || !('email' in user) || user.email !== email) throw new Error('Invalid user response');
  const currentSession = await getAuthSession();
  if (signal.aborted || currentSession.generation !== generation || getAuthUser()?.email !== email)
    throw new Error('Account session changed');
  const updated = user as CurrentUser;
  setAuthUser(updated);
  return updated;
}

export async function changeMyPassword(currentPassword: string, newPassword: string, confirmPassword: string,
  signal: AbortSignal): Promise<number> {
  const { response, generation } = await patch('password', { currentPassword, newPassword, confirmPassword }, signal);
  if (response.status !== 204) throw new Error('Invalid password change response');
  return generation;
}

export function accountSettingsErrorMessage(error: unknown, kind: 'nickname' | 'password'): string {
  if (error instanceof AccountSettingsError) {
    if (error.status === 401) return '로그인이 만료됐어요. 다시 로그인해 주세요.';
    if (kind === 'nickname' && error.status === 409) return '이미 사용 중인 닉네임이에요.';
    if (error.reason === 'Current password incorrect') return '현재 비밀번호가 일치하지 않아요.';
    if (error.reason === 'Password confirmation mismatch') return '새 비밀번호와 확인값이 일치하지 않아요.';
    if (error.reason === 'New password must be different') return '현재 비밀번호와 다른 비밀번호를 입력해 주세요.';
    if (error.status === 403) return '소셜 로그인 계정은 비밀번호를 변경할 수 없어요.';
    if (error.status === 400) return '입력값과 형식을 확인해 주세요.';
  }
  return '저장하지 못했어요. 네트워크 연결을 확인하고 다시 시도해 주세요.';
}
