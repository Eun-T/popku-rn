import { API_BASE_URL } from '../constants/api';

export type SignupRequest = {
  email: string;
  password: string;
  nickname: string;
  signupProof: string;
  consents: {
    termsOfService: boolean;
    privacyPolicy: boolean;
    marketing: boolean;
  };
};

const failureReasons = [
  'Email already registered',
  'Nickname already used',
  'Email or nickname already used',
  'Email verification required',
  'Password does not meet policy',
  'Required consent is missing',
  'Invalid email',
  'Invalid nickname',
] as const;

type SignupFailureReason = typeof failureReasons[number];

export class SignupApiError extends Error {
  constructor(readonly status: number, readonly reason: SignupFailureReason | null) {
    super('Signup request failed');
  }
}

export async function registerUser(request: SignupRequest): Promise<void> {
  const response = await fetch(API_BASE_URL + '/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (response.ok) return;

  const body = await response.text().catch(() => '');
  const reason = failureReasons.find((item) => body.includes(item)) ?? null;
  throw new SignupApiError(response.status, reason);
}
