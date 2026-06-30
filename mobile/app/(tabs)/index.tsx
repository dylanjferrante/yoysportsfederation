import { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, ScrollView, RefreshControl, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuth } from '../../lib/auth';
import { apiGet } from '../../lib/api';

type News = { id: string; category: string; sport?: string; text: string };
type Side = { abbr: string; score: number; win: boolean };
type Card = { id: string; sport: string; status: string; home: Side; away: Side };

// Federation Wire — the same live feed as the web dashboard ticker, native.
export default function Wire() {
  const { leagues } = useAuth();
  const lid = leagues[0]?.id;
  const [news, setNews] = useState<News[]>([]);
  const [scores, setScores] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!lid) { setLoading(false); return; }
    try {
      const d = await apiGet<{ news: News[]; scores: Card[] }>(`/api/leagues/${lid}/ticker`);
      setNews(d.news ?? []); setScores(d.scores ?? []);
    } catch {} finally { setLoading(false); setRefreshing(false); }
  }, [lid]);

  useEffect(() => { load(); const iv = setInterval(load, 45_000); return () => clearInterval(iv); }, [load]);

  if (!lid) return <Center text="You're not in a league yet." />;
  if (loading) return <Center spinner />;

  return (
    <FlatList
      style={{ backgroundColor: '#f8fafc' }}
      data={news}
      keyExtractor={(h) => h.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      ListHeaderComponent={
        scores.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.scoreStrip} contentContainerStyle={{ paddingHorizontal: 12 }}>
            {scores.map((c) => (
              <View key={c.id} style={s.scoreCard}>
                <Text style={s.scoreSport}>{c.sport} · {c.status}</Text>
                <ScoreRow side={c.away} />
                <ScoreRow side={c.home} />
              </View>
            ))}
          </ScrollView>
        ) : null
      }
      renderItem={({ item }) => (
        <View style={s.item}>
          {!!item.sport && <Text style={s.chip}>{item.sport}</Text>}
          <Text style={s.text}>{item.text}</Text>
        </View>
      )}
      ListEmptyComponent={<Center text="No headlines yet." />}
    />
  );
}

function ScoreRow({ side }: { side: Side }) {
  return (
    <View style={s.scoreRow}>
      <Text style={[s.abbr, side.win && s.win]}>{side.abbr}</Text>
      <Text style={[s.num, side.win && s.win]}>{side.score}</Text>
    </View>
  );
}

function Center({ text, spinner }: { text?: string; spinner?: boolean }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, backgroundColor: '#f8fafc' }}>
      {spinner ? <ActivityIndicator /> : <Text style={{ color: '#64748b' }}>{text}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  scoreStrip: { backgroundColor: '#0f172a', paddingVertical: 10 },
  scoreCard: { width: 150, backgroundColor: '#1e293b', borderRadius: 10, padding: 10, marginRight: 8 },
  scoreSport: { color: '#94a3b8', fontSize: 10, fontWeight: '700', marginBottom: 4 },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between' },
  abbr: { color: '#cbd5e1', fontSize: 13, fontWeight: '600' },
  num: { color: '#cbd5e1', fontSize: 13, fontWeight: '700' },
  win: { color: '#fff', fontWeight: '800' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eef2f7' },
  chip: { fontSize: 10, fontWeight: '700', color: '#fff', backgroundColor: '#334155', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, overflow: 'hidden' },
  text: { flex: 1, color: '#0f172a', fontSize: 14 },
});
