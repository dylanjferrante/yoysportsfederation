import * as SecureStore from 'expo-secure-store';
import { API_URL } from './config';

export async function apiGet<T = any>(path: string): Promise<T> {
  const token = await SecureStore.getItemAsync('nf_token');
  const res = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}
