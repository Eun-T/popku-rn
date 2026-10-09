import type { Href } from 'expo-router';

export type LoginReturn = { intent: 'review'; publicId: string } | { intent: 'resume'; resumeKey: string };
type Params = { intent?: unknown; publicId?: unknown; resumeKey?: unknown };
type Navigation = { getState: () => { index: number; routes: readonly { key: string; name: string; params?: object }[] } | undefined };
type Router = {
  replace: (href: Href) => void; back: () => void; canGoBack: () => boolean;
  setParams?: (params: { profileLoginSuccess: string }) => void;
};

export function parseLoginReturn(params: Params): LoginReturn | null {
  if (params.intent === 'review' && typeof params.publicId === 'string' && params.publicId.trim()) {
    return { intent: 'review', publicId: params.publicId };
  }
  if (params.intent === 'resume' && typeof params.resumeKey === 'string' && params.resumeKey) {
    return { intent: 'resume', resumeKey: params.resumeKey };
  }
  return null;
}

export function loginHref(target: LoginReturn): Href {
  return { pathname: '/login', params: { ...target } };
}

export function signupHref(target: LoginReturn, mode?: 'google'): Href {
  return { pathname: '/signup', params: { ...target, ...(mode ? { mode } : {}) } };
}

export function completedSignupHref(target: LoginReturn, generation: number): Href {
  return { pathname: '/login', params: { ...target, completedGeneration: String(generation) } };
}

export function draftLoginHref(navigation: Navigation): Href {
  const state = navigation.getState();
  const route = state?.routes[state.index];
  if (!route) throw new Error('작성 화면을 확인하지 못했어요.');
  return loginHref({ intent: 'resume', resumeKey: route.key });
}

// Only the route immediately below this root login can be resumed. No global
// return destination survives cancellation, unmount, or a subsequent login.
export function finishLoginReturn(router: Router, navigation: Navigation, target: LoginReturn | null, loginOrigin?: string): void {
  if (!target && loginOrigin === 'profile' && router.setParams) {
    const state = navigation.getState();
    if (state?.routes[state.index]?.name === 'login' && state.routes[state.index - 1]?.name === 'index') {
      // Commit the login-only animation option before its focused Effect pops it.
      router.setParams({ profileLoginSuccess: '1' });
      return;
    }
  }
  if (!target) { router.replace('/(tabs)'); return; }
  const state = navigation.getState();
  const previous = state?.routes[state.index - 1];
  if (target.intent === 'review' && previous?.name === 'places/[id]'
    && previous.params && 'id' in previous.params && previous.params.id === target.publicId) {
    router.replace({ pathname: '/reviews/write', params: { publicId: target.publicId } });
  } else if (target.intent === 'resume' && previous?.key === target.resumeKey
    && (previous.name === 'reviews/write' || previous.name === 'community/write')) {
    router.back();
  } else if (router.canGoBack()) router.back();
  else router.replace('/profile');
}
