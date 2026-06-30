import { useCallback, useEffect, useState } from 'react';
import { View, Text, SectionList, RefreshControl, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuth } from '../../lib/auth';
import { apiGet } from '../../lib/api';

type Row = { teamId: string; name: string; abbr: string; wins: number; losses: number; ties: number; pointsFor: number };
type Standing = { sport: string; rows: Row[] };

// Per-sport standings, Bearer-authed against /api/mobile/league/[id].
export default function Standings() {
  const { leagues } = useAuth();
  const lid = leagues[0]?.id;
  const myTeam = leagues[0]?.team?.id;
  const [data, setData] = useState<Standing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!lid) { setLoading(false); return; }
    try {
      const d = await apiGet<{ standings: Standing[] }>(`/api/mobile/league/${lid}`);
      setData(d.standings ?? []);
    } catch {} finally { setLoading(false); setRefreshing(false); }
  }, [lid]);

  useEffect(() => { load(); }, [load]);

  if (!lid) return <Center text="You're not in a league yet." />;
  if (loading) return <Center spinner />;

  return (
    <SectionList
      style={{ backgroundColor: '#f8fafc' }}
      sections={data.map((s) => ({ title: s.sport, data: s.rows }))}
      keyExtractor={(r, i) => r.teamId + i}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      renderSectionHeader={({ section }) => <Text style={st.header}>{section.title}</Text>}
      renderItem={({ item, index }) => (
        <View style={[st.row, item.teamId === myTeam && st.mine]}>
          <Text style={st.rank}>{index + 1}</Text>
          <Text style={st.name} numberOfLines={1}>{item.name}</Text>
          <Text style={st.rec}>{item.wins}-{item.losses}{item.ties ? `-${item.ties}` : ''}</Text>
          <Text style={st.pf}>{item.pointsFor.toFixed(0)}</Text>
        </View>
      )}
      ListEmptyComponent={<Center text="No standings yet." />}
    />
  );
}

function Center({ text, spinner }: { text?: string; spinner?: boolean }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, backgroundColor: '#f8fafc' }}>
      {spinner ? <ActivityIndicator /> : <Text style={{ color: '#64748b' }}>{text}</Text>}
    </View>
  );
}

const st = StyleSheet.create({
  header: { backgroundColor: '#0f172a', color: '#fff', fontWeight: '800', fontSize: 13, paddingHorizontal: 14, paddingVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eef2f7', backgroundColor: '#fff' },
  mine: { backgroundColor: '#eff6ff' },
  rank: { width: 24, color: '#94a3b8', fontWeight: '700' },
  name: { flex: 1, color: '#0f172a', fontWeight: '600' },
  rec: { width: 64, textAlign: 'right', color: '#334155', fontVariant: ['tabular-nums'] },
  pf: { width: 56, textAlign: 'right', color: '#94a3b8', fontVariant: ['tabular-nums'] },
});
