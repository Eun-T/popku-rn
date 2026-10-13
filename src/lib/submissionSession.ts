import { authSessionGeneration, getAuthStatus, getAuthUser, isAuthSessionCurrent, subscribeAuthSession, subscribeAuthSessionInvalidation } from './auth';

export type SubmissionOwner = { generation: number; email: string; userId?: number };

export class SubmissionSessionChangedError extends Error {
  constructor() { super('Submission session changed'); this.name = 'SubmissionSessionChangedError'; }
}

function sameAccount(owner: SubmissionOwner, user: { email: string; id?: number } | null): boolean {
  return !!user && owner.email === user.email && (owner.userId === undefined || user.id === undefined || owner.userId === user.id);
}

export function isSubmissionOwnerCurrent(owner: SubmissionOwner): boolean {
  return isAuthSessionCurrent(owner.generation) && sameAccount(owner, getAuthUser());
}

export function isSubmissionAuthCleared(owner: SubmissionOwner): boolean {
  const generation = authSessionGeneration();
  return generation === owner.generation + 1 && isAuthSessionCurrent(generation) && getAuthUser() === null && getAuthStatus() === 'anonymous';
}

export function assertSubmissionOwner(owner: SubmissionOwner, requestGeneration?: number): void {
  if (!isSubmissionOwnerCurrent(owner) || (requestGeneration !== undefined && requestGeneration !== owner.generation)) {
    throw new SubmissionSessionChangedError();
  }
}

export function captureSubmissionOwner(): SubmissionOwner {
  const user = getAuthUser(), generation = authSessionGeneration();
  if (!user || getAuthStatus() !== 'authenticated' || !isAuthSessionCurrent(generation)) throw new SubmissionSessionChangedError();
  return { generation, email: user.email, ...(user.id === undefined ? {} : { userId: user.id }) };
}

export function assertAttemptOwner(attempt: { owner?: SubmissionOwner; outcomeUnknown?: boolean; authRequired?: boolean }, owner: SubmissionOwner): void {
  assertSubmissionOwner(owner);
  if (!attempt.owner || !sameAccount(attempt.owner, { email: owner.email, id: owner.userId })
    || (attempt.owner.generation !== owner.generation && !(attempt.outcomeUnknown && attempt.authRequired))) {
    attempt.authRequired = true;
    throw new SubmissionSessionChangedError();
  }
  // A permitted explicit reauthentication retry still needs a separate task snapshot.
}

export function watchSubmissionSession(owner: SubmissionOwner, controller: AbortController, onChanged: () => void): () => void {
  let invalidated = false;
  const check = () => {
    if (invalidated || isSubmissionOwnerCurrent(owner)) return;
    invalidated = true;
    controller.abort();
    onChanged();
  };
  const stopInvalidation = subscribeAuthSessionInvalidation(check), stopSession = subscribeAuthSession(check);
  check();
  return () => { stopInvalidation(); stopSession(); };
}
