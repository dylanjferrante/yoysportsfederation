import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../lib/auth';

export default function Account() {
  const { user, leagues, logout } = useAuth();
  const router = useRouter();

  return (
    <ScrollView style={{ backgroundColor: '#f8fafc' }} contentContainerStyle={{ padding: 16 }}>
      <View style={a.card}>
        <Text style={a.name}>{user?.name}</Text>
        <Text style={a.email}>{user?.email}</Text>
      </View>

      <Text style={a.section}>Your Leagues</Text>
      {leagues.map((l) => (
        <View key={l.id} style={a.league}>
          <Text style={a.lname}>{l.name}</Text>
          <Text style={a.lmeta}>{l.season}{l.team ? ` · ${l.team.name}` : ''}{l.isCommissioner ? ' · commissioner' : ''}</Text>
        </View>
      ))}
      {leagues.length === 0 && <Text style={a.empty}>No leagues yet.</Text>}

      <TouchableOpacity style={a.logout} onPress={async () => { await logout(); router.replace('/login'); }}>
        <Text style={a.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const a = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#eef2f7' },
  name: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  email: { color: '#64748b', marginTop: 2 },
  section: { marginTop: 22, marginBottom: 8, fontWeight: '700', color: '#334155' },
  league: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#eef2f7' },
  lname: { fontWeight: '700', color: '#0f172a' },
  lmeta: { color: '#64748b', fontSize: 12, marginTop: 2 },
  empty: { color: '#94a3b8' },
  logout: { marginTop: 28, backgroundColor: '#fee2e2', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  logoutText: { color: '#dc2626', fontWeight: '700' },
});
