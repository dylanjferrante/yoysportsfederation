import * as SecureStore from 'expo-secure-store';
import { API_URL } from './config';

// Thin fetch wrapper that attaches the stored Bearer token. Returns parsed JSON
// and throws on non-2xx so screens can show an error state.
export async function apiGet<T = any>(path: string): Promise<T> {
  const token = await SecureStore.getItemAsync('nf_token');
  const res = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}
