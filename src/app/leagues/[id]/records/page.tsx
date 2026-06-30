'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { sportMeta } from '@/lib/utils'

type Side = { team: string; opp: string; score: number; oppScore: number; sport: string; season: string | null; week: number; playoff: boolean }
type PGame = { player: string; position: string; sport: string; points: number; week: number; season: string; team: string | null }
type PSeason = { player: string; position: string; sport: string; season: string; points: number }
type Data = {
  single: { highest: Side[]; lowest: Side[]; blowouts: Side[] }
  streaks: { team: string; len: number; sport: string }[]
  mostWins: { team: string; wins: number; losses: number; sport: string; season: string }[]
  bestPF: { team: string; pf: number; sport: string; season: string }[]
  titles: { team: string; sport: number; federation: number; total: number }[]
  playerGames: PGame[]
  playerSeasons: PSeason[]
  gamesPlayed: number
}

const SPORTS = ['NFL', 'NHL', 'NBA', 'MLB']
function SportTag({ s }: { s: string }) {
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${sportMeta(s).light}`}>{s}</span>
}

export default function RecordsPage() {
  const { id } = useParams<{ id: string }>()
  const [d, setD] = useState<Data | null>(null)
  const [sport, setSport] = useState('ALL')

  useEffect(() => { fetch(`/api/leagues/${id}/records`).then(r => r.json()).then(setD) }, [id])

  const by = useMemo(() => <T extends { sport: string }>(arr: T[] = []) => sport === 'ALL' ? arr : arr.filter(x => x.sport === sport), [sport])

  const ScoreList = ({ title, rows, fmt }: { title: string; rows: Side[]; fmt: (s: Side) => string }) => (
    <div className="card p-4">
      <h3 className="font-semibold text-slate-900 mb-2">{title}</h3>
      {(!rows || rows.length === 0) ? <p className="text-sm text-slate-400">No data yet.</p> : (
        <ol className="space-y-1.5">
          {rows.slice(0, 5).map((s, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <span className="text-slate-300 tabular-nums w-4">{i + 1}</span>
              <SportTag s={s.sport} />
              <span className="font-medium text-slate-800 truncate">{s.team}</span>
              <span className="text-slate-400 text-xs truncate">vs {s.opp} · {s.season} Wk{s.week}{s.playoff ? ' · PO' : ''}</span>
              <span className="ml-auto font-bold tabular-nums text-slate-900">{fmt(s)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )

  const PlayerList = ({ title, rows }: { title: string; rows: { player: string; position: string; sport: string; points: number; team?: string | null; season: string; week?: number }[] }) => (
    <div className="card p-4">
      <h3 className="font-semibold text-slate-900 mb-2">{title}</h3>
      {rows.length === 0 ? <p className="text-sm text-slate-400">No data yet.</p> : (
        <ol className="space-y-1.5">
          {rows.slice(0, 8).map((r, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <span className="text-slate-300 tabular-nums w-4">{i + 1}</span>
              <SportTag s={r.sport} />
              <span className="font-medium text-slate-800 truncate">{r.player} <span className="text-xs text-slate-400">{r.position}</span></span>
              <span className="text-slate-400 text-xs truncate hidden sm:inline">{r.team ? `${r.team} · ` : ''}{r.season}{r.week ? ` Wk${r.week}` : ''}</span>
              <span className="ml-auto font-bold tabular-nums text-slate-900">{r.points.toFixed(1)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-slate-900">Record Book</h1>
        <p className="text-sm text-slate-500">All-time league superlatives{d ? ` · ${d.gamesPlayed} games on record` : ''}</p>
      </div>

      {/* Sport filter */}
      <div className="flex gap-1.5 flex-wrap mb-5">
        <button onClick={() => setSport('ALL')} className={`px-3 py-1.5 rounded-full text-xs font-semibold ${sport === 'ALL' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>All sports</button>
        {SPORTS.map(s => (
          <button key={s} onClick={() => setSport(s)} className={`px-3 py-1.5 rounded-full text-xs font-semibold ${sport === s ? `${sportMeta(s).bg} text-white` : 'bg-slate-100 text-slate-600'}`}>{sportMeta(s).emoji} {s}</button>
        ))}
      </div>

      {!d ? <div className="card p-10 text-center text-slate-400 text-sm">Loading…</div> : (
        <div className="space-y-5">
          {/* Individual player records */}
          <div className="grid md:grid-cols-2 gap-5">
            <PlayerList title="🌟 Best single-game (player)" rows={by(d.playerGames)} />
            <PlayerList title="📅 Best season totals (player)" rows={by(d.playerSeasons)} />
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            <ScoreList title="🔥 Highest single-game (team)" rows={by(d.single.highest)} fmt={s => s.score.toFixed(1)} />
            <ScoreList title="🧊 Lowest single-game (team)" rows={by(d.single.lowest)} fmt={s => s.score.toFixed(1)} />
            <ScoreList title="💥 Biggest blowouts" rows={by(d.single.blowouts)} fmt={s => `+${(s.score - s.oppScore).toFixed(1)}`} />

            <div className="card p-4">
              <h3 className="font-semibold text-slate-900 mb-2">📈 Longest win streaks</h3>
              {by(d.streaks).length === 0 ? <p className="text-sm text-slate-400">No streaks of 2+ yet.</p> : (
                <ol className="space-y-1.5">
                  {by(d.streaks).slice(0, 5).map((s, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <span className="text-slate-300 tabular-nums w-4">{i + 1}</span>
                      <SportTag s={s.sport} />
                      <span className="font-medium text-slate-800 truncate">{s.team}</span>
                      <span className="ml-auto font-bold tabular-nums text-slate-900">{s.len}W</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            <div className="card p-4">
              <h3 className="font-semibold text-slate-900 mb-2">🏆 Most wins in a season</h3>
              <ol className="space-y-1.5">
                {by(d.mostWins).slice(0, 5).map((r, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <span className="text-slate-300 tabular-nums w-4">{i + 1}</span>
                    <SportTag s={r.sport} />
                    <span className="font-medium text-slate-800 truncate">{r.team}</span>
                    <span className="text-slate-400 text-xs">{r.season}</span>
                    <span className="ml-auto font-bold tabular-nums text-slate-900">{r.wins}–{r.losses}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="card p-4">
              <h3 className="font-semibold text-slate-900 mb-2">⚡ Best scoring seasons (PF)</h3>
              <ol className="space-y-1.5">
                {by(d.bestPF).slice(0, 5).map((r, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <span className="text-slate-300 tabular-nums w-4">{i + 1}</span>
                    <SportTag s={r.sport} />
                    <span className="font-medium text-slate-800 truncate">{r.team}</span>
                    <span className="text-slate-400 text-xs">{r.season}</span>
                    <span className="ml-auto font-bold tabular-nums text-slate-900">{r.pf.toFixed(1)}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          {/* Championships are cross-sport — only meaningful on "All sports". */}
          {sport === 'ALL' && (
            <div className="card p-4">
              <h3 className="font-semibold text-slate-900 mb-2">👑 Championship leaderboard</h3>
              {d.titles.length === 0 ? <p className="text-sm text-slate-400">No titles awarded yet.</p> : (
                <table className="w-full text-sm">
                  <thead><tr className="text-[10px] uppercase text-slate-400 border-b border-slate-100">
                    <th className="text-left py-1.5 font-semibold">Franchise</th>
                    <th className="text-right py-1.5 font-semibold">Federation</th>
                    <th className="text-right py-1.5 font-semibold">Sport</th>
                    <th className="text-right py-1.5 font-semibold">Total</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-50">
                    {d.titles.map((t, i) => (
                      <tr key={i}>
                        <td className="py-1.5 font-medium text-slate-800">{t.team}</td>
                        <td className="py-1.5 text-right tabular-nums font-bold text-amber-600">{t.federation || '—'}</td>
                        <td className="py-1.5 text-right tabular-nums text-slate-600">{t.sport || '—'}</td>
                        <td className="py-1.5 text-right tabular-nums font-bold text-slate-900">{t.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
