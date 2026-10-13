export const LOCAL_API_URL: string;
export function resolveApiBaseUrl(value: string | undefined, development: boolean): string;
export function isReleaseEnvironment(env: {
  EAS_BUILD_PROFILE?: string;
  EXPO_PUBLIC_APP_ENV?: string;
  NODE_ENV?: string;
}): boolean;
