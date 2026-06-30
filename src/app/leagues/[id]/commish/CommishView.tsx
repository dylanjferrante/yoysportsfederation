'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { SCORING_CATEGORIES } from '@/lib/scoring-categories'

type Member = { userId: string; role: string; name: string | null; email: string | null }
type Action = { id: string; action: string; details: string; createdAt: string; byName: string | null }
type Team = { id: string; name: string; abbreviation: string }
type PendingTrade = { id: string; initiator: string; recipient: string; assets: number; createdAt: string }
type Matchup = { id: string; sport: string; week: number; homeTeamId: string; awayTeamId: string | null; homeScore: number | null; awayScore: number | null; isComplete: boolean }
type Data = {
  isPrimaryCommissioner: boolean; inviteCode: string | null; season: string; sportsEnabled: string[]
  teams: Team[]; members: Member[]; actions: Action[]; pendingTrades: PendingTrade[]; matchups: Matchup[]
}
type PlayerHit = { id: string; name: string; sport: string; position: string; realTeamAbbr: string | null }

const TABS = ['Announce', 'Members', 'Trades', 'Scores', 'Stat Fix', 'Season', 'Audit'] as const
type Tab = typeof TABS[number]

export default function CommishView({ leagueId, leagueName }: { leagueId: string; leagueName: string }) {
  const [data, setData] = useState<Data | null>(null)
  const [tab, setTab] = useState<Tab>('Announce')
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null)
  const base = `/api/leagues/${leagueId}/commish`

  const load = useCallback(async () => {
    const r = await fetch(base)
    if (r.ok) setData(await r.json())
  }, [base])
  useEffect(() => { load() }, [load])

  const flash = (ok: boolean, msg: string) => { setToast({ ok, msg }); setTimeout(() => setToast(null), 3500) }

  const post = useCallback(async (body: Record<string, unknown>, okMsg: string) => {
    const r = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => ({}))
    if (r.ok) { flash(true, okMsg); await load(); return j }
    flash(false, j.error ?? 'Something went wrong')
    return null
  }, [base, load])

  const teamName = useMemo(() => Object.fromEntries((data?.teams ?? []).map(t => [t.id, t.name])), [data])

  if (!data) return <div className="text-slate-500 py-12 text-center">Loading commissioner tools…</div>

  return (
    <div className="max-w-5xl mx-auto pb-16">
      <div className="flex items-center gap-2 mb-1">
        <h1 className="text-xl font-bold text-slate-900">⚖️ Commissioner Tools</h1>
        {!data.isPrimaryCommissioner && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Co-Commissioner</span>}
      </div>
      <p className="text-sm text-slate-500 mb-5">{leagueName} · every action is recorded in the audit log.</p>

      {toast && (
        <div className={`mb-4 px-3 py-2 rounded-lg text-sm font-medium ${toast.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{toast.msg}</div>
      )}

      <div className="flex gap-1 mb-5 overflow-x-auto border-b border-slate-200">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition ${tab === t ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {t}{t === 'Trades' && data.pendingTrades.length ? ` (${data.pendingTrades.length})` : ''}
          </button>
        ))}
      </div>

      {tab === 'Announce' && <Announce post={post} invite={data.inviteCode} />}
      {tab === 'Members' && <Members data={data} post={post} />}
      {tab === 'Trades' && <Trades data={data} post={post} />}
      {tab === 'Scores' && <Scores data={data} teamName={teamName} post={post} />}
      {tab === 'Stat Fix' && <StatFix leagueId={leagueId} base={base} season={data.season} sportsEnabled={data.sportsEnabled} post={post} />}
      {tab === 'Season' && <Season season={data.season} post={post} />}
      {tab === 'Audit' && <Audit actions={data.actions} />}
    </div>
  )
}

const card = 'rounded-xl border border-slate-200 bg-white p-4'
const btn = 'px-3 py-1.5 rounded-lg text-sm font-medium transition'

// ── Announce + invite ────────────────────────────────────────────────────────
function Announce({ post, invite }: { post: any; invite: string | null }) {
  const [msg, setMsg] = useState('')
  return (
    <div className="space-y-4">
      <div className={card}>
        <h2 className="font-semibold text-slate-800 mb-2">📣 League Announcement</h2>
        <p className="text-xs text-slate-500 mb-2">Posts to the activity feed and notifies every member.</p>
        <textarea className="input w-full text-sm" rows={3} maxLength={1000} value={msg} onChange={e => setMsg(e.target.value)} placeholder="Playoffs start next week — set your lineups!" />
        <div className="mt-2 flex justify-end">
          <button disabled={!msg.trim()} onClick={async () => { const r = await post({ action: 'ANNOUNCE', message: msg }, 'Announcement sent'); if (r) setMsg('') }} className={`${btn} bg-slate-900 text-white disabled:opacity-40`}>Send announcement</button>
        </div>
      </div>
      <div className={card}>
        <h2 className="font-semibold text-slate-800 mb-2">🔗 Invite Code</h2>
        <div className="flex items-center gap-3">
          <span className="font-mono font-semibold tracking-wider text-slate-700 text-lg">{invite ?? '—'}</span>
          <button onClick={() => post({ action: 'ROTATE_INVITE' }, 'Invite code rotated')} className={`${btn} bg-slate-100 text-slate-700 hover:bg-slate-200`}>Rotate (revoke old)</button>
        </div>
      </div>
    </div>
  )
}

// ── Members / co-commissioners ───────────────────────────────────────────────
function Members({ data, post }: { data: Data; post: any }) {
  return (
    <div className={card}>
      <h2 className="font-semibold text-slate-800 mb-1">👥 Members & Co-Commissioners</h2>
      <p className="text-xs text-slate-500 mb-3">{data.isPrimaryCommissioner ? 'Grant co-commissioners full access to these tools.' : 'Only the primary commissioner can change roles.'}</p>
      <div className="divide-y divide-slate-100">
        {data.members.map(m => (
          <div key={m.userId} className="flex items-center justify-between py-2">
            <div>
              <div className="text-sm font-medium text-slate-800">{m.name ?? m.email}</div>
              <div className="text-xs text-slate-400">{m.email}</div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.role === 'COMMISSIONER' ? 'bg-blue-100 text-blue-700' : m.role === 'CO_COMMISSIONER' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                {m.role === 'CO_COMMISSIONER' ? 'Co-Commish' : m.role === 'COMMISSIONER' ? 'Commissioner' : 'Member'}
              </span>
              {data.isPrimaryCommissioner && m.role !== 'COMMISSIONER' && (
                <button
                  onClick={() => post({ action: 'SET_CO_COMMISSIONER', userId: m.userId, grant: m.role !== 'CO_COMMISSIONER' }, m.role !== 'CO_COMMISSIONER' ? 'Co-commissioner granted' : 'Co-commissioner removed')}
                  className={`${btn} ${m.role === 'CO_COMMISSIONER' ? 'bg-rose-50 text-rose-600 hover:bg-rose-100' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}>
                  {m.role === 'CO_COMMISSIONER' ? 'Revoke' : 'Make co-commish'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Pending trades: force / veto ─────────────────────────────────────────────
function Trades({ data, post }: { data: Data; post: any }) {
  if (!data.pendingTrades.length) return <div className={`${card} text-slate-500 text-sm`}>No pending trades.</div>
  return (
    <div className="space-y-2">
      {data.pendingTrades.map(t => (
        <div key={t.id} className={`${card} flex items-center justify-between`}>
          <div className="text-sm text-slate-700"><span className="font-medium">{t.initiator}</span> ↔ <span className="font-medium">{t.recipient}</span> <span className="text-slate-400">· {t.assets} asset{t.assets === 1 ? '' : 's'}</span></div>
          <div className="flex gap-2">
            <button onClick={() => post({ action: 'FORCE_TRADE', tradeId: t.id }, 'Trade forced through')} className={`${btn} bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}>Force</button>
            <button onClick={() => post({ action: 'VETO_TRADE', tradeId: t.id }, 'Trade vetoed')} className={`${btn} bg-rose-50 text-rose-600 hover:bg-rose-100`}>Veto</button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Score override ───────────────────────────────────────────────────────────
function Scores({ data, teamName, post }: { data: Data; teamName: Record<string, string>; post: any }) {
  const sports = data.sportsEnabled.length ? data.sportsEnabled : [...new Set(data.matchups.map(m => m.sport))]
  const [sport, setSport] = useState(sports[0] ?? '')
  const weeks = useMemo(() => [...new Set(data.matchups.filter(m => m.sport === sport).map(m => m.week))].sort((a, b) => a - b), [data, sport])
  const [week, setWeek] = useState<number | ''>('')
  const list = data.matchups.filter(m => m.sport === sport && (week === '' || m.week === week))

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <select className="select" value={sport} onChange={e => { setSport(e.target.value); setWeek('') }}>{sports.map(s => <option key={s}>{s}</option>)}</select>
        <select className="select" value={week} onChange={e => setWeek(e.target.value === '' ? '' : +e.target.value)}>
          <option value="">All weeks</option>
          {weeks.map(w => <option key={w} value={w}>Week {w}</option>)}
        </select>
      </div>
      <div className="space-y-2">
        {list.slice(0, 100).map(m => <ScoreRow key={m.id} m={m} teamName={teamName} post={post} />)}
        {!list.length && <div className={`${card} text-slate-500 text-sm`}>No matchups.</div>}
      </div>
    </div>
  )
}

function ScoreRow({ m, teamName, post }: { m: Matchup; teamName: Record<string, string>; post: any }) {
  const [home, setHome] = useState(String(m.homeScore ?? 0))
  const [away, setAway] = useState(String(m.awayScore ?? 0))
  return (
    <div className={`${card} flex items-center gap-2 flex-wrap`}>
      <span className="text-xs text-slate-400 w-14">Wk {m.week}</span>
      <span className="text-sm font-medium text-slate-700 flex-1 min-w-[7rem] text-right">{teamName[m.homeTeamId] ?? '—'}</span>
      <input className="input w-20 text-sm text-center py-1" value={home} onChange={e => setHome(e.target.value)} />
      <span className="text-slate-400 text-xs">vs</span>
      <input className="input w-20 text-sm text-center py-1" value={away} onChange={e => setAway(e.target.value)} />
      <span className="text-sm font-medium text-slate-700 flex-1 min-w-[7rem]">{m.awayTeamId ? (teamName[m.awayTeamId] ?? '—') : 'BYE'}</span>
      <button onClick={() => post({ action: 'SCORE_OVERRIDE', matchupId: m.id, homeScore: +home, awayScore: +away, isComplete: true }, 'Score updated')} className={`${btn} bg-slate-900 text-white`}>Save</button>
    </div>
  )
}

// ── Stat correction ──────────────────────────────────────────────────────────
function StatFix({ leagueId, base, season, sportsEnabled, post }: { leagueId: string; base: string; season: string; sportsEnabled: string[]; post: any }) {
  const sports = sportsEnabled.length ? sportsEnabled : ['NFL', 'NHL', 'NBA', 'MLB']
  const [sport, setSport] = useState(sports[0] ?? 'NFL')
  const [week, setWeek] = useState('1')
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<PlayerHit[]>([])
  const [player, setPlayer] = useState<PlayerHit | null>(null)
  const [rows, setRows] = useState<{ key: string; value: string }[]>([{ key: '', value: '' }])

  // Player search (debounced). Skip while the box already shows the picked player
  // (selecting sets q to the name, which would otherwise re-open the dropdown).
  useEffect(() => {
    if (!q.trim() || (player && q === player.name)) { setHits([]); return }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/players?q=${encodeURIComponent(q)}&sport=${sport}`)
      if (r.ok) setHits((await r.json()).slice(0, 8))
    }, 250)
    return () => clearTimeout(t)
  }, [q, sport, player])

  // Prefill the existing stat line when a player + week is chosen.
  const pick = async (p: PlayerHit) => {
    setPlayer(p); setHits([]); setQ(p.name)
    const r = await fetch(`${base}?statPlayerId=${p.id}&statSport=${sport}&statWeek=${week}`)
    const j = r.ok ? await r.json() : { stats: {} }
    const entries = Object.entries(j.stats ?? {}) as [string, number][]
    setRows(entries.length ? entries.map(([key, value]) => ({ key, value: String(value) })) : [{ key: '', value: '' }])
  }

  const keyOptions = Object.keys(SCORING_CATEGORIES[sport] ?? {})
  const submit = async () => {
    const stats: Record<string, number> = {}
    for (const r of rows) { if (r.key.trim() && r.value.trim() !== '') stats[r.key.trim()] = Number(r.value) }
    if (!player || !Object.keys(stats).length) return
    await post({ action: 'STAT_CORRECTION', playerId: player.id, sport, season, week: +week, stats }, `Corrected ${player.name} & re-scored`)
  }

  return (
    <div className={`${card} space-y-3`}>
      <p className="text-xs text-slate-500">Overwrite a player's real stat line for a week, then re-score the affected matchups.</p>
      <div className="flex gap-2">
        <select className="select" value={sport} onChange={e => { setSport(e.target.value); setPlayer(null) }}>{sports.map(s => <option key={s}>{s}</option>)}</select>
        <input className="input w-24 text-sm" type="number" min={1} value={week} onChange={e => setWeek(e.target.value)} placeholder="Week" />
      </div>
      <div className="relative">
        <input className="input w-full text-sm" value={q} onChange={e => { setQ(e.target.value); setPlayer(null) }} placeholder="Search player…" />
        {hits.length > 0 && (
          <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-auto">
            {hits.map(p => (
              <button key={p.id} onClick={() => pick(p)} className="block w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50">
                {p.name} <span className="text-slate-400">{p.position} · {p.realTeamAbbr ?? p.sport}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {player && (
        <div className="space-y-2">
          <div className="text-sm font-medium text-slate-700">{player.name} — {sport} week {week}</div>
          <datalist id="statkeys">{keyOptions.map(k => <option key={k} value={k} />)}</datalist>
          {rows.map((row, i) => (
            <div key={i} className="flex gap-2">
              <input list="statkeys" className="input flex-1 text-sm" value={row.key} placeholder="stat key (e.g. passingYards)" onChange={e => setRows(rs => rs.map((r, j) => j === i ? { ...r, key: e.target.value } : r))} />
              <input className="input w-28 text-sm" type="number" value={row.value} placeholder="value" onChange={e => setRows(rs => rs.map((r, j) => j === i ? { ...r, value: e.target.value } : r))} />
              <button onClick={() => setRows(rs => rs.filter((_, j) => j !== i))} className={`${btn} bg-slate-100 text-slate-500`}>✕</button>
            </div>
          ))}
          <button onClick={() => setRows(rs => [...rs, { key: '', value: '' }])} className={`${btn} bg-slate-100 text-slate-600`}>+ Add stat</button>
          <div className="flex justify-end">
            <button onClick={submit} className={`${btn} bg-slate-900 text-white`}>Apply correction & re-score</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Season archive / renew ───────────────────────────────────────────────────
function Season({ season, post }: { season: string; post: any }) {
  return (
    <div className={`${card} space-y-3`}>
      <div>
        <h2 className="font-semibold text-slate-800">📅 Current Season — {season}</h2>
        <p className="text-xs text-slate-500 mt-1">Archiving snapshots every franchise's current logo, name, and colors so past-season pages always show the branding used <b>that</b> season. Starting the next season carries over rosters (dynasty), resets records, and builds a fresh schedule.</p>
      </div>
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => post({ action: 'ARCHIVE_SEASON' }, `Archived ${season} branding`)} className={`${btn} bg-slate-100 text-slate-700 hover:bg-slate-200`}>Archive {season} branding</button>
        <button onClick={() => { if (confirm(`Finish ${season} and start the next season? Rosters carry over; records reset for the new season.`)) post({ action: 'RENEW_SEASON' }, 'New season started') }} className={`${btn} bg-slate-900 text-white`}>Finish {season} &amp; start next season →</button>
      </div>
    </div>
  )
}

// ── Audit log ────────────────────────────────────────────────────────────────
function Audit({ actions }: { actions: Action[] }) {
  if (!actions.length) return <div className={`${card} text-slate-500 text-sm`}>No commissioner actions yet.</div>
  return (
    <div className={card}>
      <h2 className="font-semibold text-slate-800 mb-3">🧾 Audit Log</h2>
      <div className="divide-y divide-slate-100">
        {actions.map(a => (
          <div key={a.id} className="py-2 text-sm flex items-start gap-3">
            <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-mono whitespace-nowrap">{a.action}</span>
            <span className="text-slate-500 flex-1 break-all">{a.details}</span>
            <span className="text-xs text-slate-400 whitespace-nowrap">{a.byName ?? '—'} · {new Date(a.createdAt + 'Z').toLocaleDateString()}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
