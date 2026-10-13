import { LOCAL_API_URL, resolveApiBaseUrl } from './apiEnvironment';

// A release bundle cannot opt into development behavior through an environment variable.
export const IS_DEVELOPMENT_ENVIRONMENT = __DEV__
  && process.env.EXPO_PUBLIC_APP_ENV !== 'production'
  && process.env.EXPO_PUBLIC_APP_ENV !== 'preview';
export const API_BASE_URL = resolveApiBaseUrl(process.env.EXPO_PUBLIC_API_URL, IS_DEVELOPMENT_ENVIRONMENT);

// Keep legacy local sessions; every other API gets its own SecureStore-safe namespace.
export const API_TOKEN_STORAGE_NAMESPACE = API_BASE_URL === LOCAL_API_URL
  ? ''
  : `api.${API_BASE_URL.split('').map(character => character.charCodeAt(0).toString(16)).join('_')}`;

