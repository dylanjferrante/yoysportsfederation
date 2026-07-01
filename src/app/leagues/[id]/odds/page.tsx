'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { sportMeta } from '@/lib/utils'

type Team = { id: string; name: string; abbreviation: string; logo: string | null; primaryColor: string }
type Odds = {
  perSport: Record<string, { playoff: Record<string, number>; title: Record<string, number> }>
  federation: Record<string, number>
  fedPoints: Record<string, number>
  sims: number
}
type Data = { teams: Team[]; sports: string[]; includedSports: string[]; odds: Odds | null }

const pct = (n: number | undefined) => n == null ? '—' : n < 0.001 ? '<0.1%' : `${(n * 100).toFixed(1)}%`

export default function OddsPage() {
  const { id } = useParams<{ id: string }>()
  const [d, setD] = useState<Data | null>(null)
  const [sport, setSport] = useState<string>('FED')

  useEffect(() => { fetch(`/api/leagues/${id}/odds`).then(r => r.json()).then(setD) }, [id])

  if (!d) return <div className="card p-10 text-center text-slate-400 text-sm">Simulating season…</div>

  const tname = Object.fromEntries(d.teams.map(t => [t.id, t]))
  const odds = d.odds

  const fedRows = odds ? [...d.teams]
    .map(t => ({ t, fed: odds.federation[t.id] ?? 0, pts: odds.fedPoints[t.id] ?? 0 }))
    .sort((a, b) => b.fed - a.fed || b.pts - a.pts) : []

  const sportRows = (sp: string) => odds ? [...d.teams]
    .filter(t => odds.perSport[sp]?.playoff[t.id] != null)
    .map(t => ({ t, po: odds.perSport[sp].playoff[t.id] ?? 0, title: odds.perSport[sp].title[t.id] ?? 0 }))
    .sort((a, b) => b.title - a.title || b.po - a.po) : []

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900">Playoff & Championship Odds</h1>
        <p className="text-sm text-slate-500">Rest-of-season Monte-Carlo projection{odds ? ` · ${odds.sims.toLocaleString()} simulations` : ''}</p>
      </div>

      {!odds ? (
        <div className="card p-10 text-center text-slate-400 text-sm">No season data to simulate yet.</div>
      ) : (
        <>
          <div className="flex gap-1.5 flex-wrap mb-4">
            <button onClick={() => setSport('FED')} className={`px-3 py-1.5 rounded-full text-xs font-semibold ${sport === 'FED' ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600'}`}>Federation</button>
            {d.sports.map(s => (
              <button key={s} onClick={() => setSport(s)} className={`px-3 py-1.5 rounded-full text-xs font-semibold ${sport === s ? `${sportMeta(s).bg} text-white` : 'bg-slate-100 text-slate-600'}`}>{sportMeta(s).emoji} {s}</button>
            ))}
          </div>

          {sport === 'FED' ? (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100">
                <h2 className="font-semibold text-slate-900">Odds to win the Federation</h2>
                <p className="text-xs text-slate-400">Aggregated across {d.includedSports.join(', ')} · expected federation points</p>
              </div>
              <div className="table-scroll">
              <table className="w-full text-sm">
                <thead><tr className="text-[10px] uppercase text-slate-400 border-b border-slate-100">
                  <th className="text-left px-4 py-2 font-semibold">Club</th>
                  <th className="text-right px-4 py-2 font-semibold">Fed Title</th>
                  <th className="text-right px-4 py-2 font-semibold">Exp. Pts</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-50">
                  {fedRows.map(({ t, fed, pts }, i) => (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2">
                        <span className="text-slate-300 tabular-nums mr-2">{i + 1}</span>
                        <Link href={`/leagues/${id}/teams/${t.id}`} className="font-medium text-slate-800 hover:text-blue-600">{t.name}</Link>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="inline-flex items-center gap-2">
                          <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden hidden sm:block"><div className="h-full bg-amber-500" style={{ width: `${Math.min(100, fed * 100)}%` }} /></div>
                          <span className="font-bold tabular-nums text-slate-900 w-14 text-right">{pct(fed)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-500">{pts.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${sportMeta(sport).light}`}>{sport}</span>
                <h2 className="font-semibold text-slate-900">Playoff & title odds</h2>
                {!d.includedSports.includes(sport) && <span className="text-[10px] text-slate-400">(excluded from federation)</span>}
              </div>
              <div className="table-scroll">
              <table className="w-full text-sm">
                <thead><tr className="text-[10px] uppercase text-slate-400 border-b border-slate-100">
                  <th className="text-left px-4 py-2 font-semibold">Club</th>
                  <th className="text-right px-4 py-2 font-semibold">Make Playoffs</th>
                  <th className="text-right px-4 py-2 font-semibold">Win {sport}</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-50">
                  {sportRows(sport).map(({ t, po, title }, i) => (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2">
                        <span className="text-slate-300 tabular-nums mr-2">{i + 1}</span>
                        <Link href={`/leagues/${id}/teams/${t.id}`} className="font-medium text-slate-800 hover:text-blue-600">{t.name}</Link>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-600">{pct(po)}</td>
                      <td className="px-4 py-2 text-right font-bold tabular-nums text-slate-900">{pct(title)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
