import type { Href } from 'expo-router';
import type { NavigationState, PartialState } from 'expo-router/react-navigation';

export type LoginReturn = { intent: 'review'; publicId: string } | { intent: 'resume'; resumeKey: string };
type Params = { intent?: unknown; publicId?: unknown; resumeKey?: unknown };
type Navigation = {
  getState: () => { key?: string; index: number; routes: readonly {
    key: string; name: string; params?: object; state?: NavigationState | PartialState<NavigationState>;
  }[] } | undefined;
  getParent?: () => Navigation | undefined;
  dispatch?: (action: { type: string; target?: string; payload: object }) => void;
};
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

export function loginHref(target: LoginReturn | null, loginOrigin?: string): Href {
  return { pathname: '/login', params: { ...target, ...(loginOrigin ? { loginOrigin } : {}) } };
}

export function signupHref(target: LoginReturn | null, mode?: 'google' | 'apple', loginOrigin?: string): Href {
  return { pathname: '/signup', params: { ...target, ...(mode ? { mode } : {}), ...(loginOrigin ? { loginOrigin } : {}) } };
}

export function completedSignupHref(target: LoginReturn | null, generation: number, loginOrigin?: string): Href {
  return { pathname: '/login', params: { ...target, ...(loginOrigin ? { loginOrigin } : {}), completedGeneration: String(generation) } };
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
  if (!target && loginOrigin === 'profile') {
    const state = navigation.getState();
    const tabs = state?.routes[state.index - 1];
    const profile = tabs?.state?.routes.find(route => route.name === 'profile');
    if (state?.index === 1 && state.routes[state.index]?.name === 'login' && tabs?.name === '(tabs)'
      && !profile?.state?.routes.some(route => route.name === 'login' || route.name === 'signup')) {
      router.back();
      return;
    }
  }
  if (!target) {
    // A Root login can push a nested profile signup, creating a second Tabs
    // screen above it. Replacing that child's screen cannot remove Root login.
    let root = navigation;
    let parent = root.getParent?.();
    while (parent) { root = parent; parent = root.getParent?.(); }
    const state = root.getState?.();
    const tabs = state?.routes.find(route => route.name === '(tabs)');
    const tabsState = tabs?.state;
    const profileIndex = tabsState?.routes.findIndex(route => route.name === 'profile') ?? -1;
    const profile = tabsState?.routes[profileIndex];
    if (root.dispatch && tabs && tabsState && profile) {
      const index = profile.state?.routes.find(route => route.name === 'index') ?? { name: 'index' };
      // Keep the original Tabs/Profile keys and other tab state. Remove auth
      // history at both levels only after the caller completes its attempt.
      root.dispatch({ type: 'RESET', target: state?.key, payload: {
        ...state, index: 0, routes: [{ ...tabs, state: {
          ...tabsState, index: profileIndex, routes: tabsState.routes.map(route => route === profile
            ? { ...route, state: { ...route.state, index: 0, routes: [index] } }
            : route),
        } }],
      } });
      return;
    }
  }
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
