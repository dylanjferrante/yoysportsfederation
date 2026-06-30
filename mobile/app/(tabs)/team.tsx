import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Modal, Pressable, ActivityIndicator, RefreshControl, StyleSheet } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../../lib/auth';
import { apiGet } from '../../lib/api';
import { API_URL } from '../../lib/config';

const SPORTS = ['NFL', 'NHL', 'NBA', 'MLB'];
const RESERVE = ['BN', 'IR', 'IL', 'DL', 'TAXI'];
const isStarter = (slot: string) => !RESERVE.includes(slot);

type P = { rosterId: string; slot: string; sport: string; id: string; name: string; position: string; realTeamAbbr: string | null; seasonPoints: number; projectedPoints: number; locked?: boolean; opp?: { opp: string; home: boolean } | null };

export default function Team() {
  const { leagues } = useAuth();
  const teamId = leagues[0]?.team?.id;
  const [data, setData] = useState<any>(null);
  const [sport, setSport] = useState('NFL');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<P | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    if (!teamId) { setLoading(false); return; }
    try {
      const d = await apiGet(`/api/teams/${teamId}/roster`);
      setData(d);
      const present = SPORTS.filter((s) => (d.players ?? []).some((p: P) => p.sport === s));
      setSport((prev) => (present.includes(prev) ? prev : present[0] ?? prev));
    } catch {} finally { setLoading(false); setRefreshing(false); }
  }, [teamId]);

  useEffect(() => { load(); }, [load]);

  const players: P[] = useMemo(() => (data?.players ?? []).filter((p: P) => p.sport === sport), [data, sport]);
  const starters = players.filter((p) => isStarter(p.slot)).sort((a, b) => b.seasonPoints - a.seasonPoints);
  const bench = players.filter((p) => !isStarter(p.slot)).sort((a, b) => b.seasonPoints - a.seasonPoints);
  const canManage = !!data?.canManage;
  const slotOptions: string[] = useMemo(() => {
    const cfg = (data?.rosterSettings ?? {})[sport] ?? {};
    return [...Object.keys(cfg), 'BN', 'IR', 'TAXI'].filter((v, i, a) => a.indexOf(v) === i);
  }, [data, sport]);

  async function setSlot(rosterId: string, slot: string) {
    setErr('');
    const token = await SecureStore.getItemAsync('nf_token');
    const res = await fetch(`${API_URL}/api/teams/${teamId}/roster`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'SET_SLOT', rosterId, slot }),
    });
    setEditing(null);
    if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(j.error || 'Move failed'); return; }
    load();
  }

  if (!teamId) return <Center text="You don't have a franchise in this league." />;
  if (loading) return <Center spinner />;

  const Row = ({ p }: { p: P }) => (
    <TouchableOpacity disabled={!canManage || p.locked} onPress={() => setEditing(p)} style={s.row}>
      <Text style={[s.slot, isStarter(p.slot) ? s.slotStart : s.slotBench]}>{p.locked ? '🔒' : ''}{p.slot}</Text>
      <View style={{ flex: 1 }}>
        <Text style={s.name} numberOfLines={1}>{p.name}</Text>
        <Text style={s.meta}>{p.position}{p.realTeamAbbr ? ` · ${p.realTeamAbbr}` : ''}{p.opp ? ` · ${p.opp.home ? 'vs' : '@'}${p.opp.opp}` : ''}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={s.pts}>{(p.seasonPoints ?? 0).toFixed(1)}</Text>
        <Text style={s.proj}>proj {(p.projectedPoints ?? 0).toFixed(1)}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <View style={s.tabs}>
        {SPORTS.filter((sp) => (data?.players ?? []).some((p: P) => p.sport === sp)).map((sp) => (
          <TouchableOpacity key={sp} onPress={() => setSport(sp)} style={[s.tab, sport === sp && s.tabOn]}>
            <Text style={[s.tabText, sport === sp && s.tabTextOn]}>{sp}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {!!err && <Text style={s.err}>{err}</Text>}
      <FlatList
        data={[{ k: 'Starting Lineup', rows: starters }, { k: 'Bench', rows: bench }]}
        keyExtractor={(s2) => s2.k}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        renderItem={({ item }) => (
          <View>
            <Text style={s.section}>{item.k}</Text>
            {item.rows.map((p) => <Row key={p.rosterId} p={p} />)}
          </View>
        )}
      />

      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <Pressable style={s.backdrop} onPress={() => setEditing(null)}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>Move {editing?.name}</Text>
            <View style={s.sheetGrid}>
              {slotOptions.map((slot) => (
                <TouchableOpacity key={slot} onPress={() => editing && setSlot(editing.rosterId, slot)} style={[s.sheetBtn, editing?.slot === slot && s.sheetBtnOn]}>
                  <Text style={[s.sheetBtnText, editing?.slot === slot && s.sheetBtnTextOn]}>{slot}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function Center({ text, spinner }: { text?: string; spinner?: boolean }) {
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, backgroundColor: '#f8fafc' }}>{spinner ? <ActivityIndicator /> : <Text style={{ color: '#64748b', textAlign: 'center' }}>{text}</Text>}</View>;
}

const s = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eef2f7' },
  tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: '#f1f5f9' },
  tabOn: { backgroundColor: '#0f172a' },
  tabText: { color: '#475569', fontWeight: '700', fontSize: 13 },
  tabTextOn: { color: '#fff' },
  err: { color: '#dc2626', paddingHorizontal: 14, paddingTop: 8 },
  section: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 6, fontWeight: '800', color: '#334155', fontSize: 12, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  slot: { width: 50, textAlign: 'center', fontSize: 11, fontWeight: '800', paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  slotStart: { backgroundColor: '#dbeafe', color: '#1d4ed8' },
  slotBench: { backgroundColor: '#f1f5f9', color: '#64748b' },
  name: { color: '#0f172a', fontWeight: '600' },
  meta: { color: '#94a3b8', fontSize: 12, marginTop: 1 },
  pts: { color: '#0f172a', fontWeight: '800' },
  proj: { color: '#94a3b8', fontSize: 11 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, paddingBottom: 34 },
  sheetTitle: { fontWeight: '800', fontSize: 16, color: '#0f172a', marginBottom: 14 },
  sheetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  sheetBtn: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 10, backgroundColor: '#f1f5f9' },
  sheetBtnOn: { backgroundColor: '#0f172a' },
  sheetBtnText: { fontWeight: '700', color: '#334155' },
  sheetBtnTextOn: { color: '#fff' },
});
