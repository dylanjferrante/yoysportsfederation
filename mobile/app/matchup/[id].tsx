import { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { apiGet } from '../../lib/api';

type Player = { slot: string; name: string; position: string; abbr: string | null; points: number | null; projected: number; bucket: 'final' | 'live' | 'pending'; label: string };
type Side = { team: string; abbr: string; players: Player[]; final: number; live: number; pending: number; ptsIn: number; projLeft: number };
type Game = { sport: string; week: number; isComplete: boolean; homeScore: number; awayScore: number; home: Side | null; away: Side | null };

export default function Matchup() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [g, setG] = useState<Game | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { (async () => { try { setG(await apiGet(`/api/mobile/matchup/${id}`)); } catch {} finally { setLoading(false); } })(); }, [id]);

  if (loading) return <Center spinner />;
  if (!g || !g.home || !g.away) return <Center text="Matchup not found." />;

  return (
    <>
      <Stack.Screen options={{ title: `${g.sport} · Week ${g.week}`, headerStyle: { backgroundColor: '#0f172a' }, headerTintColor: '#fff' }} />
      <ScrollView style={{ backgroundColor: '#f8fafc' }}>
        <View style={s.board}>
          <Team name={g.home.team} score={g.homeScore} win={g.homeScore >= g.awayScore && g.isComplete} />
          <Text style={s.vs}>{g.isComplete ? 'FINAL' : 'VS'}</Text>
          <Team name={g.away.team} score={g.awayScore} win={g.awayScore > g.homeScore && g.isComplete} />
        </View>

        <Text style={s.h2}>📡 Game Tracker</Text>
        <View style={s.trackRow}>
          {[g.home, g.away].map((side, i) => (
            <View key={i} style={s.trackCol}>
              <Text style={s.trackTeam} numberOfLines={1}>{side!.team}</Text>
              <Text style={s.trackPts}>{side!.ptsIn.toFixed(1)} in · ~{side!.projLeft.toFixed(0)} to come</Text>
              <View style={s.pills}>
                <Text style={[s.pill, s.pillNeutral]}>✓ {side!.final}</Text>
                <Text style={[s.pill, side!.live ? s.pillLive : s.pillNeutral]}>🔴 {side!.live}</Text>
                <Text style={[s.pill, side!.pending ? s.pillPend : s.pillNeutral]}>⏳ {side!.pending}</Text>
              </View>
            </View>
          ))}
        </View>

        {[g.home, g.away].map((side, i) => (
          <View key={i} style={s.lineup}>
            <Text style={s.lineupTitle}>{side!.team}</Text>
            {side!.players.map((p, j) => (
              <View key={j} style={s.prow}>
                <Text style={s.pslot}>{p.slot}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.pname} numberOfLines={1}>{p.name}</Text>
                  <Text style={s.pmeta}>{p.position}{p.abbr ? ` · ${p.abbr}` : ''}</Text>
                </View>
                <Text style={[s.plabel, p.bucket === 'live' ? s.live : p.bucket === 'pending' ? s.pend : s.done]}>{p.bucket === 'live' ? '🔴 ' : ''}{p.label}</Text>
                <Text style={s.ppts}>{p.points == null ? '—' : p.points.toFixed(1)}</Text>
              </View>
            ))}
          </View>
        ))}
        <View style={{ height: 24 }} />
      </ScrollView>
    </>
  );
}

function Team({ name, score, win }: { name: string; score: number; win: boolean }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={s.tname} numberOfLines={1}>{name}</Text>
      <Text style={[s.tscore, win && { color: '#0f172a' }]}>{score.toFixed(1)}</Text>
    </View>
  );
}

function Center({ text, spinner }: { text?: string; spinner?: boolean }) {
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, backgroundColor: '#f8fafc' }}>{spinner ? <ActivityIndicator /> : <Text style={{ color: '#64748b' }}>{text}</Text>}</View>;
}

const s = StyleSheet.create({
  board: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingVertical: 22, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#eef2f7' },
  vs: { color: '#cbd5e1', fontWeight: '800', fontSize: 12, width: 56, textAlign: 'center' },
  tname: { color: '#0f172a', fontWeight: '700', marginBottom: 4 },
  tscore: { color: '#dc2626', fontWeight: '900', fontSize: 34 },
  h2: { fontWeight: '800', color: '#0f172a', fontSize: 15, paddingHorizontal: 14, paddingTop: 16, paddingBottom: 8 },
  trackRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 14 },
  trackCol: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#eef2f7' },
  trackTeam: { fontWeight: '700', color: '#0f172a' },
  trackPts: { color: '#64748b', fontSize: 11, marginTop: 2, marginBottom: 8 },
  pills: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  pill: { fontSize: 11, fontWeight: '700', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8, overflow: 'hidden' },
  pillNeutral: { backgroundColor: '#f1f5f9', color: '#64748b' },
  pillLive: { backgroundColor: '#fee2e2', color: '#dc2626' },
  pillPend: { backgroundColor: '#dbeafe', color: '#2563eb' },
  lineup: { marginTop: 16 },
  lineupTitle: { fontWeight: '800', color: '#334155', paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#f1f5f9' },
  prow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  pslot: { width: 44, fontSize: 11, fontWeight: '800', color: '#64748b' },
  pname: { color: '#0f172a', fontWeight: '600' },
  pmeta: { color: '#94a3b8', fontSize: 11 },
  plabel: { fontSize: 10, fontWeight: '700' },
  live: { color: '#ef4444' },
  pend: { color: '#2563eb' },
  done: { color: '#94a3b8' },
  ppts: { width: 44, textAlign: 'right', fontWeight: '800', color: '#0f172a' },
});
