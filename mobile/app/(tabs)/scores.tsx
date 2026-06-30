import { useCallback, useEffect, useState } from 'react';
import { View, Text, SectionList, TouchableOpacity, RefreshControl, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { apiGet } from '../../lib/api';

type Side = { abbr: string; score: number; win: boolean };
type Card = { id: string; sport: string; status: string; home: Side; away: Side };

export default function Scores() {
  const { leagues } = useAuth();
  const lid = leagues[0]?.id;
  const router = useRouter();
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!lid) { setLoading(false); return; }
    try { const d = await apiGet<{ scores: Card[] }>(`/api/leagues/${lid}/ticker`); setCards(d.scores ?? []); }
    catch {} finally { setLoading(false); setRefreshing(false); }
  }, [lid]);

  useEffect(() => { load(); }, [load]);

  if (!lid) return <Center text="You're not in a league yet." />;
  if (loading) return <Center spinner />;

  const sports = [...new Set(cards.map((c) => c.sport))];
  const sections = sports.map((sp) => ({ title: sp, data: cards.filter((c) => c.sport === sp) }));

  return (
    <SectionList
      style={{ backgroundColor: '#f8fafc' }}
      sections={sections}
      keyExtractor={(c) => c.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      renderSectionHeader={({ section }) => <Text style={s.header}>{section.title}</Text>}
      renderItem={({ item }) => (
        <TouchableOpacity style={s.card} onPress={() => router.push(`/matchup/${item.id}`)}>
          <View style={{ flex: 1 }}>
            <TeamLine side={item.away} />
            <TeamLine side={item.home} />
          </View>
          <View style={s.right}>
            <Text style={[s.status, item.status === 'LIVE' && s.live]}>{item.status === 'LIVE' ? '● LIVE' : 'Final'}</Text>
            <Text style={s.chevron}>›</Text>
          </View>
        </TouchableOpacity>
      )}
      ListEmptyComponent={<Center text="No games scored yet." />}
    />
  );
}

function TeamLine({ side }: { side: Side }) {
  return (
    <View style={s.line}>
      <Text style={[s.abbr, side.win && s.win]}>{side.abbr}</Text>
      <Text style={[s.score, side.win && s.win]}>{side.score}</Text>
    </View>
  );
}

function Center({ text, spinner }: { text?: string; spinner?: boolean }) {
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, backgroundColor: '#f8fafc' }}>{spinner ? <ActivityIndicator /> : <Text style={{ color: '#64748b' }}>{text}</Text>}</View>;
}

const s = StyleSheet.create({
  header: { backgroundColor: '#0f172a', color: '#fff', fontWeight: '800', fontSize: 13, paddingHorizontal: 14, paddingVertical: 8 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eef2f7' },
  line: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2, maxWidth: 220 },
  abbr: { color: '#475569', fontWeight: '600', fontSize: 15 },
  score: { color: '#475569', fontWeight: '700', fontSize: 15, fontVariant: ['tabular-nums'] },
  win: { color: '#0f172a', fontWeight: '800' },
  right: { alignItems: 'flex-end', flexDirection: 'row', gap: 10 },
  status: { fontSize: 11, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase' },
  live: { color: '#ef4444' },
  chevron: { color: '#cbd5e1', fontSize: 22 },
});
