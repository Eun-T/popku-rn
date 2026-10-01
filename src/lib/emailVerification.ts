import { API_BASE_URL } from '../constants/api';

export class EmailVerificationApiError extends Error {
  constructor(readonly status: number) {
    super('Email verification request failed');
  }
}

async function requireSuccess(response: Response): Promise<void> {
  if (!response.ok) throw new EmailVerificationApiError(response.status);
}

export async function checkEmailAvailability(email: string): Promise<boolean> {
  const response = await fetch(
    API_BASE_URL + '/api/users/check-email?email=' + encodeURIComponent(email),
  );
  await requireSuccess(response);

  const body: unknown = await response.json();
  if (!body || typeof body !== 'object' || !('available' in body) || typeof body.available !== 'boolean') {
    throw new Error('Invalid email availability response');
  }
  return body.available;
}

export async function sendEmailVerification(email: string): Promise<void> {
  const response = await fetch(API_BASE_URL + '/api/auth/email-verifications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (__DEV__) console.info('[SIGNUP] verification send status:', response.status);
  await requireSuccess(response);
}

export async function verifyEmailCode(email: string, code: string): Promise<void> {
  const response = await fetch(API_BASE_URL + '/api/auth/email-verifications/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  });
  if (__DEV__) console.info('[SIGNUP] verification verify status:', response.status);
  await requireSuccess(response);
}
