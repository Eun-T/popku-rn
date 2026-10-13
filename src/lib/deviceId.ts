import * as SecureStore from 'expo-secure-store';
import { uuid } from 'expo-modules-core';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEVICE_ID_KEY = 'popchive.installationDeviceId.v1';
const INSTALLATION_MARKER_KEY = 'popchive.installation.v1';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let deviceId: Promise<string> | undefined;

/** Native UUID v4 uses the platform random generator; never fall back to Math.random. */
export function getDeviceId(): Promise<string> {
  if (!deviceId) {
    const pending = (async () => {
      // iOS Keychain can survive uninstall; this non-secret marker cannot.
      const marker = await AsyncStorage.getItem(INSTALLATION_MARKER_KEY);
      const saved = await SecureStore.getItemAsync(DEVICE_ID_KEY);
      if (marker && saved && UUID_V4.test(saved)) return saved;
      const generated = uuid.v4();
      if (!UUID_V4.test(generated)) throw new Error('Secure device ID generation failed');
      await SecureStore.setItemAsync(DEVICE_ID_KEY, generated);
      await AsyncStorage.setItem(INSTALLATION_MARKER_KEY, '1');
      return generated;
    })();
    deviceId = pending;
    void pending.catch(() => { if (deviceId === pending) deviceId = undefined; });
  }
  return deviceId;
}
