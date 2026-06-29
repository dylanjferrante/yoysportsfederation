'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { sportMeta } from '@/lib/utils'

type Side = { team: string; opp: string; score: number; oppScore: number; sport: string; season: string | null; week: number; playoff: boolean }
type Data = {
  single: { highest: Side[]; lowest: Side[]; blowouts: Side[] }
  streaks: { team: string; len: number; sport: string }[]
  mostWins: { team: string; wins: number; losses: number; sport: string; season: string }[]
  bestPF: { team: string; pf: number; sport: string; season: string }[]
  titles: { team: string; sport: number; federation: number; total: number }[]
  gamesPlayed: number
}

function SportTag({ s }: { s: string }) {
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${sportMeta(s).light}`}>{s}</span>
}

export default function RecordsPage() {
  const { id } = useParams<{ id: string }>()
  const [d, setD] = useState<Data | null>(null)

  useEffect(() => { fetch(`/api/leagues/${id}/records`).then(r => r.json()).then(setD) }, [id])

  const ScoreList = ({ title, rows, fmt }: { title: string; rows: Side[]; fmt: (s: Side) => string }) => (
    <div className="card p-4">
      <h3 className="font-semibold text-slate-900 mb-2">{title}</h3>
      {(!rows || rows.length === 0) ? <p className="text-sm text-slate-400">No data yet.</p> : (
        <ol className="space-y-1.5">
          {rows.map((s, i) => (
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

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-5">
        <Link href={`/leagues/${id}`} className="btn-ghost text-slate-500">← League</Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Record Book</h1>
          <p className="text-sm text-slate-500">All-time league superlatives{d ? ` · ${d.gamesPlayed} games on record` : ''}</p>
        </div>
      </div>

      {!d ? <div className="card p-10 text-center text-slate-400 text-sm">Loading…</div> : (
        <div className="space-y-5">
          <div className="grid md:grid-cols-2 gap-5">
            <ScoreList title="🔥 Highest single-game scores" rows={d.single.highest} fmt={s => s.score.toFixed(1)} />
            <ScoreList title="🧊 Lowest single-game scores" rows={d.single.lowest} fmt={s => s.score.toFixed(1)} />
            <ScoreList title="💥 Biggest blowouts" rows={d.single.blowouts} fmt={s => `+${(s.score - s.oppScore).toFixed(1)}`} />

            <div className="card p-4">
              <h3 className="font-semibold text-slate-900 mb-2">📈 Longest win streaks</h3>
              {d.streaks.length === 0 ? <p className="text-sm text-slate-400">No streaks of 2+ yet.</p> : (
                <ol className="space-y-1.5">
                  {d.streaks.map((s, i) => (
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
                {d.mostWins.map((r, i) => (
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
                {d.bestPF.map((r, i) => (
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
        </div>
      )}
    </div>
  )
}
