'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { sportMeta } from '@/lib/utils'

type Game = { id: string; home: string; homeName: string; away: string; awayName: string; homeScore: number | null; awayScore: number | null; complete: boolean }
type Data = {
  sport: string; season: string
  board: { week: number; games: Game[] }[]
  myPicks: { game: string; week: number; matchupId: string | null; pickedTeamId: string }[]
  standings: {
    highScore: { team: string; teamId: string; weeks: number }[]
    pickem: { userId: string; name: string | null; correct: number; decided: number; made: number }[]
    survivor: { userId: string; name: string | null; alive: boolean; survived: number; outWeek: number | null; picks: { week: number; team: string; outcome: string }[] }[]
  }
  config: { highScore: boolean; survivor: boolean; pickem: boolean }
  isCommissioner: boolean
  signedIn: boolean
}

const SPORTS = ['NFL', 'NHL', 'NBA', 'MLB']

export default function SideGames() {
  const { id } = useParams<{ id: string }>()
  const [sport, setSport] = useState('NFL')
  const [game, setGame] = useState<'HIGH' | 'SURVIVOR' | 'PICKEM'>('HIGH')
  const [d, setD] = useState<Data | null>(null)

  const load = useCallback(() => { fetch(`/api/leagues/${id}/sidegames?sport=${sport}`).then(r => r.json()).then(setD) }, [id, sport])
  useEffect(() => { load() }, [load])

  async function toggleGame(key: 'highScore' | 'survivor' | 'pickem', on: boolean) {
    if (!d) return
    const next = { ...d.config, [key]: on }
    await fetch(`/api/leagues/${id}/settings`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sideGames: next }) })
    load()
  }
  const cfg = d?.config ?? { highScore: true, survivor: true, pickem: true }
  const gameOn: Record<'HIGH' | 'SURVIVOR' | 'PICKEM', boolean> = { HIGH: cfg.highScore, SURVIVOR: cfg.survivor, PICKEM: cfg.pickem }

  // If the selected game gets disabled, jump to the first enabled one.
  useEffect(() => {
    if (!d) return
    if (!gameOn[game]) {
      const first = (['HIGH', 'SURVIVOR', 'PICKEM'] as const).find(g => gameOn[g])
      if (first) setGame(first)
    }
  }, [d, game]) // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(g: 'SURVIVOR' | 'PICKEM', week: number, matchupId: string, pickedTeamId: string) {
    const r = await fetch(`/api/leagues/${id}/sidegames`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ game: g, sport, week, matchupId, pickedTeamId }) })
    if (!r.ok) alert((await r.json().catch(() => ({}))).error ?? 'Could not save pick')
    load()
  }

  const pickFor = (g: string, matchupId: string) => d?.myPicks.find(p => p.game === g && p.matchupId === matchupId)?.pickedTeamId
  const meta = sportMeta(sport)

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900">Side Games</h1>
        <p className="text-sm text-slate-500">High-score pool · survivor · weekly pick&apos;em</p>
      </div>

      <div className="flex gap-1.5 flex-wrap mb-3">
        {SPORTS.map(s => <button key={s} onClick={() => setSport(s)} className={`px-3 py-1.5 rounded-full text-xs font-semibold ${sport === s ? `${sportMeta(s).bg} text-white` : 'bg-slate-100 text-slate-600'}`}>{sportMeta(s).emoji} {s}</button>)}
      </div>
      {d?.isCommissioner && (
        <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
          <span className="text-slate-400 font-medium">Commissioner — enabled games:</span>
          {([['highScore', 'High-Score Pool'], ['survivor', 'Survivor'], ['pickem', "Pick'em"]] as const).map(([k, lbl]) => (
            <button key={k} onClick={() => toggleGame(k, !cfg[k])} className={`px-2 py-1 rounded-full font-medium ${cfg[k] ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400 line-through'}`}>
              {cfg[k] ? '✓ ' : ''}{lbl}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-1 border-b border-slate-200 mb-5">
        {gameOn.HIGH && <button onClick={() => setGame('HIGH')} className={game === 'HIGH' ? 'tab-active' : 'tab-inactive'}>High-Score Pool</button>}
        {gameOn.SURVIVOR && <button onClick={() => setGame('SURVIVOR')} className={game === 'SURVIVOR' ? 'tab-active' : 'tab-inactive'}>Survivor</button>}
        {gameOn.PICKEM && <button onClick={() => setGame('PICKEM')} className={game === 'PICKEM' ? 'tab-active' : 'tab-inactive'}>Pick&apos;em</button>}
        {!gameOn.HIGH && !gameOn.SURVIVOR && !gameOn.PICKEM && <span className="py-2 text-sm text-slate-400">No side games are enabled.</span>}
      </div>

      {!d ? <div className="card p-10 text-center text-slate-400 text-sm">Loading…</div> : (
        <>
          {gameOn.HIGH && game === 'HIGH' && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100">
                <h2 className="font-semibold text-slate-900">High-Score Pool</h2>
                <p className="text-xs text-slate-400">Each week, the franchise with the single highest score earns a point. Auto-scored.</p>
              </div>
              {d.standings.highScore.length === 0 ? <p className="px-4 py-8 text-center text-slate-400 text-sm">No completed weeks yet.</p> : (
                <ol className="divide-y divide-slate-50">
                  {d.standings.highScore.map((r, i) => (
                    <li key={r.teamId} className="flex items-center gap-3 px-4 py-2 text-sm">
                      <span className="text-slate-300 tabular-nums w-5">{i + 1}</span>
                      <Link href={`/teams/${r.teamId}`} className="font-medium text-slate-800 hover:text-blue-600 flex-1">{r.team}</Link>
                      <span className="font-bold tabular-nums" style={{ color: meta.hex }}>{r.weeks} {r.weeks === 1 ? 'week' : 'weeks'}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}

          {gameOn.SURVIVOR && game === 'SURVIVOR' && (
            <div className="space-y-5">
              <div className="card overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100">
                  <h2 className="font-semibold text-slate-900">Survivor standings</h2>
                  <p className="text-xs text-slate-400">Pick one winner each week — a franchise can only be used once. One loss and you&apos;re out.</p>
                </div>
                {d.standings.survivor.length === 0 ? <p className="px-4 py-8 text-center text-slate-400 text-sm">No picks yet.</p> : (
                  <ul className="divide-y divide-slate-50">
                    {d.standings.survivor.map(s => (
                      <li key={s.userId} className="px-4 py-2 text-sm flex items-center gap-3">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${s.alive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>{s.alive ? 'ALIVE' : `OUT W${s.outWeek}`}</span>
                        <span className="font-medium text-slate-800 flex-1">{s.name}</span>
                        <span className="text-xs text-slate-400">{s.survived} survived</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {d.signedIn && <PickBoard d={d} game="SURVIVOR" pickFor={pickFor} submit={submit} accent={meta.hex} />}
            </div>
          )}

          {gameOn.PICKEM && game === 'PICKEM' && (
            <div className="space-y-5">
              <div className="card overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100">
                  <h2 className="font-semibold text-slate-900">Pick&apos;em standings</h2>
                  <p className="text-xs text-slate-400">Pick the winner of every matchup. Most correct wins.</p>
                </div>
                {d.standings.pickem.length === 0 ? <p className="px-4 py-8 text-center text-slate-400 text-sm">No picks yet.</p> : (
                  <ul className="divide-y divide-slate-50">
                    {d.standings.pickem.map((p, i) => (
                      <li key={p.userId} className="px-4 py-2 text-sm flex items-center gap-3">
                        <span className="text-slate-300 tabular-nums w-5">{i + 1}</span>
                        <span className="font-medium text-slate-800 flex-1">{p.name}</span>
                        <span className="font-bold tabular-nums text-slate-900">{p.correct}<span className="text-slate-400 font-normal">/{p.decided}</span></span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {d.signedIn && <PickBoard d={d} game="PICKEM" pickFor={pickFor} submit={submit} accent={meta.hex} />}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function PickBoard({ d, game, pickFor, submit, accent }: {
  d: Data; game: 'SURVIVOR' | 'PICKEM'
  pickFor: (g: string, m: string) => string | undefined
  submit: (g: 'SURVIVOR' | 'PICKEM', week: number, matchupId: string, teamId: string) => void
  accent: string
}) {
  const open = d.board.filter(w => w.games.some(g => !g.complete))
  if (open.length === 0) return <div className="card p-6 text-center text-slate-400 text-sm">No upcoming matchups to pick.</div>
  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 font-semibold text-slate-900">Make your picks</div>
      <div className="divide-y divide-slate-100">
        {open.map(w => (
          <div key={w.week} className="p-4">
            <p className="text-xs font-bold uppercase text-slate-400 mb-2">Week {w.week}</p>
            <div className="space-y-2">
              {w.games.filter(g => !g.complete).map(g => {
                const picked = pickFor(game, g.id)
                const Btn = ({ teamId, name }: { teamId: string; name: string }) => (
                  <button onClick={() => submit(game, w.week, g.id, teamId)}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition ${picked === teamId ? 'text-white border-transparent' : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'}`}
                    style={picked === teamId ? { background: accent } : undefined}>
                    {picked === teamId ? '✓ ' : ''}{name}
                  </button>
                )
                return (
                  <div key={g.id} className="flex items-center gap-2">
                    <Btn teamId={g.home} name={g.homeName} />
                    <span className="text-[10px] text-slate-300">vs</span>
                    <Btn teamId={g.away} name={g.awayName} />
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
