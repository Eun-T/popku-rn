import { LOCAL_API_URL, resolveApiBaseUrl } from './apiEnvironment';

// A release bundle cannot opt into development behavior through an environment variable.
export const IS_DEVELOPMENT_ENVIRONMENT = __DEV__
  && process.env.EXPO_PUBLIC_APP_ENV !== 'production'
  && process.env.EXPO_PUBLIC_APP_ENV !== 'preview';
export const API_BASE_URL = resolveApiBaseUrl(process.env.EXPO_PUBLIC_API_URL, IS_DEVELOPMENT_ENVIRONMENT);

// Both production domains serve the same backend. Keep the existing production keys
// across app upgrades; do not migrate tokens or share sessions with other API hosts.
const tokenStorageUrl = API_BASE_URL === 'https://api.theplave.co.kr'
  ? 'https://api.popchive.com'
  : API_BASE_URL;
export const API_TOKEN_STORAGE_NAMESPACE = tokenStorageUrl === LOCAL_API_URL
  ? ''
  : `api.${tokenStorageUrl.split('').map(character => character.charCodeAt(0).toString(16)).join('_')}`;

