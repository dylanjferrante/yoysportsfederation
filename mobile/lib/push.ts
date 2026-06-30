import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { API_URL } from './config';

// Show notifications while the app is foregrounded too.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }),
});

// Ask for permission, get this device's Expo push token, and register it with
// the backend (so server events — trades, waivers — can push to it). Safe to
// call repeatedly; no-ops on a simulator or without an EAS projectId.
export async function registerForPush(): Promise<void> {
  try {
    if (!Device.isDevice) return;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', { name: 'default', importance: Notifications.AndroidImportance.DEFAULT });
    }
    const existing = await Notifications.getPermissionsAsync();
    const status = existing.granted ? 'granted' : (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;

    const projectId = (Constants.expoConfig?.extra as any)?.eas?.projectId;
    if (!projectId) return; // set by `eas build:configure`
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    const auth = await SecureStore.getItemAsync('nf_token');
    if (!auth || !token) return;

    await fetch(`${API_URL}/api/mobile/push/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
      body: JSON.stringify({ token, platform: Platform.OS }),
    });
  } catch { /* push is best-effort */ }
}
