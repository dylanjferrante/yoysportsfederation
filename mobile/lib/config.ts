import Constants from 'expo-constants';

export const API_URL: string =
  (Constants.expoConfig?.extra?.apiUrl as string | undefined)?.replace(/\/$/, '') ||
  'https://your-app.example.com';
