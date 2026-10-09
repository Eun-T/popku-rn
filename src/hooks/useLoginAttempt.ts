import { useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { authSessionGeneration, clearTokens, getCurrentUser, saveTokens, setAuthUser } from '../lib/auth';

type Attempt = { generation: number; saving: boolean; completed: boolean };
type Tokens = Parameters<typeof saveTokens>[0];

// Guard the existing token/profile sequence with screen lifetime and the same
// generation used by logout/401. A cancelled attempt cannot complete a later login.
export function useLoginAttempt(scope: string) {
  const current = useRef<Attempt | null>(null);
  const focused = useRef(false);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    return () => {
      focused.current = false;
      const attempt = current.current;
      current.current = null;
      if (attempt?.saving && !attempt.completed) void clearTokens(attempt.generation).catch(() => {});
    };
  }, [scope]));
  const active = (attempt: Attempt) => focused.current && current.current === attempt;
  const valid = (attempt: Attempt) => active(attempt) && attempt.generation === authSessionGeneration();
  return {
    begin(): Attempt | null {
      if (!focused.current || current.current) return null;
      const attempt = { generation: authSessionGeneration(), saving: false, completed: false };
      current.current = attempt;
      return attempt;
    },
    active,
    valid,
    async authenticate(attempt: Attempt, tokens: Tokens): Promise<boolean> {
      if (!valid(attempt)) return false;
      const saving = saveTokens(tokens);
      attempt.generation = authSessionGeneration();
      attempt.saving = true;
      await saving;
      if (!valid(attempt)) return false;
      const user = await getCurrentUser(tokens.accessToken);
      if (!valid(attempt)) return false;
      setAuthUser(user);
      return true;
    },
    complete(attempt: Attempt): boolean {
      if (!valid(attempt)) return false;
      attempt.completed = true;
      return true;
    },
    async fail(attempt: Attempt): Promise<boolean> {
      if (!valid(attempt)) return false;
      if (attempt.saving) await clearTokens(attempt.generation).catch(() => {});
      return active(attempt);
    },
    release(attempt: Attempt) { if (current.current === attempt) current.current = null; },
  };
}
