import { API_BASE_URL } from '../constants/api';

export async function checkNicknameAvailability(nickname: string, signal: AbortSignal): Promise<boolean> {
  const response = await fetch(
    API_BASE_URL + '/api/users/check-nickname?nickname=' + encodeURIComponent(nickname),
    { signal },
  );
  if (!response.ok) throw new Error('Nickname availability request failed');

  const body: unknown = await response.json();
  if (!body || typeof body !== 'object' || !('available' in body) || typeof body.available !== 'boolean') {
    throw new Error('Invalid nickname availability response');
  }
  return body.available;
}
