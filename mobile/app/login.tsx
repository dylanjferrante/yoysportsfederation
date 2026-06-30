import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth';

export default function Login() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setErr(''); setBusy(true);
    try {
      await login(email.trim(), password);
      router.replace('/(tabs)');
    } catch (e: any) {
      setErr(e?.message === '401' ? 'Invalid email or password' : (e?.message || 'Login failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.center}>
        <Text style={s.logo}>NF</Text>
        <Text style={s.title}>Nexus Federation</Text>
        <Text style={s.sub}>Sign in to your franchise</Text>

        <TextInput style={s.input} placeholder="Email" placeholderTextColor="#64748b" autoCapitalize="none"
          keyboardType="email-address" value={email} onChangeText={setEmail} />
        <TextInput style={s.input} placeholder="Password" placeholderTextColor="#64748b" secureTextEntry
          value={password} onChangeText={setPassword} onSubmitEditing={submit} />
        {!!err && <Text style={s.err}>{err}</Text>}

        <TouchableOpacity style={s.btn} onPress={submit} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Sign In</Text>}
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f172a' },
  center: { flex: 1, justifyContent: 'center', padding: 28 },
  logo: { alignSelf: 'center', width: 56, height: 56, lineHeight: 56, textAlign: 'center', borderRadius: 14, backgroundColor: '#3b82f6', color: '#fff', fontWeight: '800', fontSize: 22, overflow: 'hidden', marginBottom: 16 },
  title: { color: '#fff', fontSize: 26, fontWeight: '800', textAlign: 'center' },
  sub: { color: '#94a3b8', textAlign: 'center', marginBottom: 28 },
  input: { backgroundColor: '#1e293b', color: '#fff', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, marginBottom: 12 },
  err: { color: '#f87171', marginBottom: 8 },
  btn: { backgroundColor: '#3b82f6', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
