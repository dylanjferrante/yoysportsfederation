import Constants from 'expo-constants';

// Base URL of the deployed Nexus Federation web backend (the Next.js app). Set
// this to your deployed URL in app.json → expo.extra.apiUrl (it must be a real
// https host the phone can reach — not localhost). For local dev against a
// machine on your network, use that machine's LAN IP, e.g. http://192.168.1.20:3000.
export const API_URL: string =
  (Constants.expoConfig?.extra?.apiUrl as string | undefined)?.replace(/\/$/, '') ||
  'https://your-app.example.com';
