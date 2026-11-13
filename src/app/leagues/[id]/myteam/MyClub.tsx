'use client'

// My Club — the ySF redesign's club manager, wired to the real Nexus APIs:
//   lineup  → POST /api/teams/:id/roster  (SET_SLOT, per day for daily leagues; DROP)
//   claims  → POST /api/leagues/:id/waivers (SUBMIT / CANCEL), FAAB bids
//   trades  → POST /api/trades, PATCH /api/trades/:id (CANCEL / ACCEPT / REJECT)
//   data    → GET  /api/leagues/:id/myclub, /api/teams/:id/roster, /api/trades
import { useCallback, useEffect, useMemo, useState } from 'react'
import { slotEligible } from '@/lib/defaults'
import { YSF_LEAGUES, YSF_ART, U, injTag } from '@/lib/ysf'

type Game = { opp: string; home: boolean; epoch: number | null; status: string; gameId: string } | null
type RP = { rosterId: string; playerId: string; name: string; position: string; pos: string; team: string | null; slot: string; injury: string | null; game: Game; locked: boolean; gp: number; points: number | null; wkGp?: number; wkPoints?: number | null }
type FA = { playerId: string; name: string; position: string; pos: string; team: string | null; gp: number; points: number; injury: string | null; pending: boolean; clears: string | null }
type Club = { id: string; name: string; abbreviation: string; logo: string | null; altLogo: string | null; primaryColor: string | null }
type Data = {
  team: Club; sports: { sport: string; code: string }[]; sport: string; code: string; cadence: 'DAILY' | 'WEEKLY'; week: number | null; dates: string[]; date: string | null; today: string
  matchup: { week: number; start: string; end: string; me: number; them: number; opp: Club | null } | null
  slots: Record<string, number>; roster: RP[]; faab: number; claims: { id: string; bid: number; add: any; drop: any }[]; freeAgents: FA[]; clubs: Club[]
}

const RESERVE = ['BN', 'IR', 'TAXI']
const ORDER: Record<string, string[]> = {
  NFL: ['QB', 'RB', 'WR', 'TE', 'RB/WR/TE', 'K', 'DEF'], NHL: ['C', 'LW', 'RW', 'D', 'UTIL', 'G'],
  NBA: ['PG', 'SG', 'SF', 'PF', 'C', 'UTIL'], MLB: ['C', '1B', '2B', '3B', 'SS', 'OF', 'UTIL', 'SP', 'RP'],
}
const SLOT_LABEL: Record<string, string> = { 'RB/WR/TE': 'FLEX', DEF: 'D/ST' }
const injTagOf = (st: string) => injTag(st) ?? 'INJ'
const lg = (sport: string) => YSF_LEAGUES.find(l => l.sport === sport) ?? YSF_LEAGUES[0]
const posFix = (p: string) => p.replace(/\bDEF\b/g, 'D/ST')
const meta = (code: string, team: string | null, pos: string) => `(${code}-${team || 'FA'}, ${posFix(pos)})`
const fmtTime = (ms: number, withDay: boolean) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', ...(withDay ? { weekday: 'short' } : {}), hour: 'numeric', minute: '2-digit' }).format(new Date(ms))
const isLive = (s: string) => /live|progress/i.test(s)
const isFinal = (s: string) => /final|completed/i.test(s)
const positionsOf = (p: { pos: string; position: string }) => [...new Set([...p.pos.split('/'), p.position])].filter(Boolean)
const fits = (p: { pos: string; position: string }, slot: string) => RESERVE.includes(slot) || positionsOf(p).some(x => slotEligible(x, slot))

const btn = 'inline-flex items-center justify-center leading-none rounded font-display font-bold tracking-[.08em] text-[12px] disabled:opacity-40'

// `embedded`: shown inside the club page (which has its own club band), so no MY CLUB heading.
// `sport` / `view`: the club page's own tabs choose the league and the tool, so this hides its
// league buttons and tool tabs.
type View = 'lineup' | 'players' | 'trade' | 'pending'
export default function MyClub({ leagueId, embedded = false, sport: fixedSport, view }: { leagueId: string; embedded?: boolean; sport?: string; view?: View }) {
  const [sport, setSport] = useState<string | null>(null)
  const [date, setDate] = useState<string | null>(null)
  const [data, setData] = useState<Data | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // ?tab=trade / pending / players opens that tab (links from the Trades and Players pages)
  const initialTab = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('tab') : null
  const [tabState, setTab] = useState<View>((['players', 'trade', 'pending'] as const).find(t => t === initialTab) ?? 'lineup')
  const tab = view ?? tabState
  const [sel, setSel] = useState<string | null>(null)
  const [dropAsk, setDropAsk] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [statSpan, setStatSpan] = useState<'season' | 'week'>('season')

  const load = useCallback(async (s?: string | null, d?: string | null) => {
    const q = new URLSearchParams(); if (s) q.set('sport', s); if (d) q.set('date', d)
    const r = await fetch(`/api/leagues/${leagueId}/myclub?${q}`)
    const j = await r.json()
    if (!r.ok) { setErr(j.error || 'Could not load your club'); return }
    setErr(null); setData(j); setSport(j.sport); setDate(j.date)
  }, [leagueId])
  useEffect(() => { load(fixedSport ?? null) }, [load, fixedSport])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3200); return () => clearTimeout(t) }, [toast])

  const L = data ? lg(data.sport) : YSF_LEAGUES[0]
  const pickSport = (s: string) => { setSel(null); setDropAsk(null); load(s, null) }
  const pickDate = (d: string) => { setSel(null); setDropAsk(null); load(sport, d) }

  const roster = async (body: any) => {
    const r = await fetch(`/api/teams/${data!.team.id}/roster`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error || 'That move wasn’t allowed')
  }
  const run = async (fn: () => Promise<void>, ok?: string) => {
    setBusy(true)
    try { await fn(); if (ok) setToast(ok) } catch (e: any) { setToast(e.message) }
    setSel(null); setDropAsk(null); await load(sport, date); setBusy(false)
  }
  const setSlot = (p: RP, slot: string) => roster({ action: 'SET_SLOT', rosterId: p.rosterId, slot, ...(data!.cadence === 'DAILY' && date ? { date } : {}) })

  if (err) return <div className="card p-8 text-center font-semibold text-ink-500">{err}</div>
  if (!data) return <div className="card p-8 text-center text-ink-400">Loading your club…</div>

  const dayPast = !!data.date && data.date < data.today
  const starterKeys = [...(ORDER[data.sport] ?? []).filter(k => data.slots[k]), ...Object.keys(data.slots).filter(k => !RESERVE.includes(k) && !(ORDER[data.sport] ?? []).includes(k) && !['IL', 'DL'].includes(k))]
  const selP = sel ? data.roster.find(p => p.rosterId === sel) ?? null : null
  const activeMax = starterKeys.reduce((a, k) => a + (data.slots[k] ?? 0), 0) + (data.slots.BN ?? 0)
  const active = data.roster.filter(p => !['IR', 'TAXI'].includes(p.slot)).length
  const starters = data.roster.filter(p => !RESERVE.includes(p.slot)).length

  // ---------- lineup rows ----------
  type Row = { key: string; slot: string; label: string; p: RP | null; starter: boolean }
  const starterRows: Row[] = []
  for (const k of starterKeys) {
    const ps = data.roster.filter(p => p.slot === k)
    const n = Math.max(data.slots[k] ?? 0, ps.length)
    for (let i = 0; i < n; i++) starterRows.push({ key: `${k}-${i}`, slot: k, label: SLOT_LABEL[k] ?? k, p: ps[i] ?? null, starter: true })
  }
  const reserveRows = (w: string) => data.roster.filter(p => p.slot === w).map(p => ({ key: p.rosterId, slot: w, label: w, p, starter: false } as Row))

  const actionsFor = (row: Row) => {
    const p = row.p
    if (dayPast) return { lock: 'FINAL' as string | null }
    if (p?.locked) return { lock: p.game && isLive(p.game.status) ? 'LIVE' : 'FINAL' }
    if (selP) {
      if (p && p.rosterId === selP.rosterId) return { cancel: true }
      if (selP.locked) return {}
      if (row.starter && fits(selP, row.slot)) {
        if (!p) return { here: () => run(() => setSlot(selP, row.slot), `${selP.name} → ${SLOT_LABEL[row.slot] ?? row.slot}`), hereLabel: 'MOVE HERE' }
        if (p.locked) return {}
        const back = RESERVE.includes(selP.slot) ? selP.slot : (fits(p, selP.slot) ? selP.slot : 'BN')
        return { here: () => run(async () => { await setSlot(selP, row.slot); await setSlot(p, back) }, `${selP.name} ⇄ ${p.name}`), hereLabel: 'SWAP' }
      }
      if (!row.starter && p && p.slot === 'BN' && !RESERVE.includes(selP.slot) && fits(p, selP.slot))
        return { here: () => run(async () => { await setSlot(p, selP.slot); await setSlot(selP, 'BN') }, `${p.name} ⇄ ${selP.name}`), hereLabel: 'SWAP' }
      return {}
    }
    if (!p) return {}
    return { move: () => { setSel(p.rosterId); setDropAsk(null) }, drop: true }
  }
  const groupDrop = (w: string) => {
    if (!selP || selP.locked || dayPast || selP.slot === w) return null
    if (w !== 'BN' && (data.slots[w] ?? 0) > 0 && data.roster.filter(p => p.slot === w).length >= (data.slots[w] ?? 0)) return null
    return () => run(() => setSlot(selP, w), `${selP.name} → ${w === 'BN' ? 'Bench' : w === 'IR' ? 'Injured Reserve' : 'Taxi Squad'}`)
  }

  const gameCell = (p: RP | null) => {
    if (!p) return { opp: '', when: '', ink: '#000', sub: '#4A4A4A', w: 500 }
    const g = p.game
    if (!g) return { opp: '—', when: data.week ? 'No game' : '', ink: '#8A8A8A', sub: '#8A8A8A', w: 500 }
    const opp = (g.home ? 'vs ' : '@') + g.opp
    if (isLive(g.status)) return { opp, when: 'LIVE', ink: '#000', sub: '#ba0c2f', w: 700 }
    if (isFinal(g.status)) return { opp, when: 'FINAL', ink: '#000', sub: '#4A4A4A', w: 700 }
    return { opp, when: g.epoch ? fmtTime(g.epoch, data.cadence !== 'DAILY') : '', ink: '#000', sub: '#4A4A4A', w: 500 }
  }

  const Lineup = (
    <section className="flex flex-col gap-4">
      <div className="flex gap-1 p-1 bg-white border border-ink-100 rounded-xl self-start">
        {([['season', 'SEASON'], ['week', 'THIS WEEK']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setStatSpan(k)} className={`${btn} h-9 px-3 text-[12px]`} style={{ background: statSpan === k ? '#000' : '#fff', color: statSpan === k ? '#fff' : '#4A4A4A' }}>{l}</button>
        ))}
      </div>
      {data.dates.length > 0 && (
        <div className="grid grid-cols-7 gap-1">
          {data.dates.map(d => {
            const dt = new Date(d + 'T12:00:00'); const on = d === data.date; const past = d < data.today
            return (
              <button key={d} onClick={() => pickDate(d)} className="flex flex-col items-center justify-center gap-[3px] h-[54px] rounded border font-display tracking-[.08em] leading-none"
                style={{ borderColor: on ? L.color : '#E5E5E5', background: on ? L.color : '#fff', color: on ? '#fff' : past ? '#8A8A8A' : '#000' }}>
                <span className="text-[12px] font-bold">{d === data.today ? 'TODAY' : dt.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}</span>
                <span className="text-[11px] font-medium opacity-85">{dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()}</span>
              </button>
            )
          })}
        </div>
      )}
      {[{ label: 'STARTERS', count: `${starters} / ${starterKeys.reduce((a, k) => a + (data.slots[k] ?? 0), 0)}`, rows: starterRows, drop: null as any },
        { label: 'BENCH', count: String(reserveRows('BN').length), rows: reserveRows('BN'), drop: groupDrop('BN') },
        { label: 'INJURED RESERVE', count: `${reserveRows('IR').length}${data.slots.IR ? ' / ' + data.slots.IR : ''}`, rows: reserveRows('IR'), drop: groupDrop('IR') },
        { label: 'TAXI SQUAD', count: `${reserveRows('TAXI').length}${data.slots.TAXI ? ' / ' + data.slots.TAXI : ''}`, rows: reserveRows('TAXI'), drop: groupDrop('TAXI') }]
        .filter(g => g.rows.length || g.drop || g.label === 'BENCH').map(g => (
        <div key={g.label} className="card overflow-hidden" style={{ borderTop: `4px solid ${L.color}` }}>
          <div className="ui flex flex-wrap items-center gap-x-[10px] px-4 py-2 bg-ink-50 text-[12px] font-bold tracking-[.12em] min-h-[40px]">
            <span className="flex-1 whitespace-nowrap">{g.label} <span className="text-ink-500 font-medium">{g.count}</span></span>
            <span className="hidden sm:inline w-[108px] text-ink-500 font-medium">OPP</span>
            <span className="hidden sm:inline w-[56px] text-right text-ink-500 font-medium">{statSpan === 'week' ? 'WK PTS' : 'FPTS'}</span>
            <span className="hidden sm:inline w-[46px] text-right text-ink-500 font-medium">AVG</span>
            <span className="w-[152px] ml-auto flex justify-end">{g.drop && <button disabled={busy} onClick={g.drop} className={`${btn} h-[30px] px-3 bg-black text-white`}>MOVE HERE</button>}</span>
          </div>
          {g.rows.map(row => {
            const p = row.p, a: any = actionsFor(row), gc = gameCell(p), isSel = !!p && p.rosterId === sel
            const inj = p?.injury ? injTagOf(p.injury) : null
            return (
              <div key={row.key} className="flex flex-wrap items-center gap-x-[10px] gap-y-[6px] px-4 py-2 border-t border-ink-50" style={{ background: isSel ? '#F2F2F2' : '#fff', boxShadow: isSel ? 'inset 4px 0 0 #000' : 'none' }}>
                <span className="ui w-[56px] flex-none inline-flex items-center justify-center leading-none h-[28px] rounded-[3px] text-[12px] font-bold" style={{ background: row.starter ? L.color : '#E5E5E5', color: row.starter ? '#fff' : '#1F1F1F' }}>{row.label === 'BN' ? 'BN' : row.label}</span>
                <span className="flex-[1_1_230px] min-w-0 font-bold" style={{ color: p ? '#000' : '#8A8A8A' }}>
                  {p ? p.name : 'Empty'}
                  {inj && <> <span title={(p as any)?.injuryNote ?? p?.injury ?? ''} className="ui inline-flex items-center justify-center leading-none h-[18px] px-[5px] rounded-[2px] bg-[#ba0c2f] text-white text-[10px] font-bold align-[2px]">{inj}</span></>}
                  {p && <span className="block font-normal text-[13px] text-ink-500">{meta(data.code, p.team, p.pos)}</span>}
                </span>
                <span className="w-[108px] flex-none leading-tight"><span className="block font-bold text-[14px]" style={{ color: gc.ink }}>{gc.opp}</span><span className="block text-[12px]" style={{ color: gc.sub, fontWeight: gc.w }}>{gc.when}</span></span>
                {(() => { const pts = statSpan === 'week' ? p?.wkPoints ?? null : p?.points ?? null, gp = statSpan === 'week' ? p?.wkGp ?? 0 : p?.gp ?? 0; return <>
                <span className="hidden sm:inline w-[56px] flex-none text-right font-bold tabular-nums">{p ? (pts == null ? '—' : pts.toFixed(1)) : ''}</span>
                <span className="w-[46px] flex-none text-right font-semibold tabular-nums text-ink-800">{p ? (gp && pts != null ? (pts / gp).toFixed(1) : '—') : ''}</span></> })()}
                <span className="w-[152px] flex-none ml-auto flex gap-[6px] justify-end">
                  {a.lock && <span className="ui inline-flex items-center justify-center leading-none h-[32px] px-[10px] rounded bg-ink-50 text-ink-500 text-[11px] font-bold">{a.lock}</span>}
                  {a.here && <button disabled={busy} onClick={a.here} className={`${btn} h-[32px] px-3 bg-black text-white`}>{a.hereLabel}</button>}
                  {a.cancel && <button onClick={() => setSel(null)} className={`${btn} h-[32px] px-3 border border-black bg-white text-black`}>CANCEL</button>}
                  {a.move && <button disabled={busy} onClick={a.move} className={`${btn} h-[32px] px-3 border border-black bg-white text-black`}>MOVE</button>}
                  {a.drop && p && (dropAsk === p.rosterId
                    ? <button disabled={busy} onClick={() => run(() => roster({ action: 'DROP', rosterId: p.rosterId }), `Dropped ${p.name}`)} className={`${btn} h-[32px] px-3 bg-[#ba0c2f] text-white`}>CONFIRM DROP</button>
                    : <button disabled={busy} onClick={() => setDropAsk(p.rosterId)} className={`${btn} h-[32px] px-3 border border-ink-200 bg-white text-ink-500`}>DROP</button>)}
                </span>
              </div>
            )
          })}
          {!g.rows.length && <div className="px-4 py-3 text-ink-400 font-semibold border-t border-ink-50">Empty</div>}
        </div>
      ))}
    </section>
  )

  const opp = data.matchup?.opp
  const span = data.matchup ? (() => {
    const a = new Date(data.matchup.start), b = new Date(data.matchup.end)
    const m = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' })
    return a.getMonth() === b.getMonth() ? `${m(a)} ${a.getDate()}–${b.getDate()}, ${b.getFullYear()}` : `${m(a)} ${a.getDate()} – ${m(b)} ${b.getDate()}, ${b.getFullYear()}`
  })() : ''

  return (
    <div className={`flex flex-col gap-5 ${embedded ? '' : 'pb-8'}`}>
      {!embedded && (
        <div className="flex items-end justify-between gap-4 border-b-2 border-black pb-3.5">
          <div><div className="eyebrow">{U(`${data.team.name} · 2026–27`)}</div><h1 className="disp text-[40px] sm:text-[64px] font-extrabold leading-[.85] mt-1.5">MY CLUB</h1></div>
          {data.team.logo && <span className="w-14 h-14 inline-flex items-center justify-center"><img src={data.team.logo} alt="" className="w-14 h-14 object-contain" /></span>}
        </div>
      )}

      {!(fixedSport && view) && <div className="flex flex-wrap justify-between items-center gap-3">
        {!fixedSport && (view === undefined || view === 'lineup' || view === 'players') && <div className="flex flex-wrap gap-2">
          {data.sports.map(s => {
            const l = lg(s.sport), on = s.sport === data.sport
            return (
              <button key={s.sport} onClick={() => pickSport(s.sport)} className={`${btn} gap-2 h-[44px] pl-[10px] pr-[14px] border-2 text-[14px]`} style={{ borderColor: l.color, background: on ? l.color : '#fff', color: on ? '#fff' : '#000' }}>
                <span className="w-[26px] h-[26px] inline-flex items-center justify-center"><img src={YSF_ART.leagueSymbol(l.key, on ? 'color' : 'white')} alt="" className="w-[26px] h-[26px] object-contain" /></span>
                <span className="ysf-case">{s.code}</span>
              </button>
            )
          })}
        </div>}
        {!view && <div role="tablist" className="flex gap-1 p-1 bg-white border border-ink-100 rounded-xl overflow-x-auto">
          {([['lineup', 'LINEUP'], ['players', 'ADD / DROP'], ['trade', 'TRADE'], ['pending', 'PENDING']] as const).map(([k, l]) => (
            <button key={k} role="tab" onClick={() => setTab(k)} className={tab === k ? 'tab-active' : 'tab-inactive'}>{l}{k === 'pending' && data.claims.length ? ` (${data.claims.length})` : ''}</button>
          ))}
        </div>}
      </div>}

      {(tab === 'lineup' || tab === 'players') && <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-ink-100 border border-ink-100 rounded overflow-hidden">
        {[['ROSTER', `${active} / ${activeMax}`], ['STARTERS', `${starters} / ${starterKeys.reduce((a, k) => a + (data.slots[k] ?? 0), 0)}`], ['BENCH', String(data.roster.filter(p => p.slot === 'BN').length)], ['FAAB', `$${data.faab}`]].map(([k, v]) => (
          <div key={k} className="bg-white px-4 py-3"><div className="ui text-[11px] text-ink-500">{k}</div><div className="disp text-[26px] font-extrabold leading-tight">{v}</div></div>
        ))}
      </div>

      {data.matchup && opp ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 rounded overflow-hidden text-white">
          <div className="flex items-center gap-3 px-4 py-3" style={{ background: data.team.primaryColor ?? '#000' }}>
            <span className="w-11 h-11 inline-flex items-center justify-center flex-none"><img src={(data.team.altLogo || data.team.logo)!} alt="" className="w-11 h-11 object-contain" /></span>
            <div className="min-w-0"><div className="ui text-[11px] opacity-85">{U(`${data.cadence === 'DAILY' ? 'Scoring period' : 'Week'} · ${span}`)}</div><div className="disp text-[22px] font-extrabold">{data.team.abbreviation}</div></div>
            <span className="disp ml-auto text-[32px] font-extrabold tabular-nums">{(data.matchup.me ?? 0).toFixed(2)}</span>
          </div>
          <div className="flex flex-row-reverse items-center gap-3 px-4 py-3 text-right" style={{ background: opp.primaryColor ?? '#000' }}>
            <span className="w-11 h-11 inline-flex items-center justify-center flex-none"><img src={(opp.altLogo || opp.logo)!} alt="" className="w-11 h-11 object-contain" /></span>
            <div className="min-w-0"><div className="ui text-[11px] opacity-85">OPPONENT</div><div className="disp text-[22px] font-extrabold">{opp.abbreviation}</div></div>
            <span className="disp mr-auto text-[32px] font-extrabold tabular-nums">{(data.matchup.them ?? 0).toFixed(2)}</span>
          </div>
        </div>
      ) : (
        <div className="ui bg-black text-white rounded px-4 py-3.5 text-[13px] font-bold">OFFSEASON · NO MATCHUP THIS WEEK</div>
      )}
      </>}

      {tab === 'lineup' && Lineup}
      {tab === 'players' && <AddDrop data={data} L={L} busy={busy} setBusy={setBusy} leagueId={leagueId} reload={() => load(sport, date)} toast={setToast} />}
      {tab === 'trade' && <Trade data={data} leagueId={leagueId} toast={setToast} onSent={() => setTab('pending')} />}
      {tab === 'pending' && <Pending data={data} leagueId={leagueId} reload={() => load(sport, date)} toast={setToast} />}

      {toast && <div className="fixed left-1/2 -translate-x-1/2 bottom-[76px] z-50 bg-black text-white px-4 py-3 rounded font-semibold shadow-lg max-w-[90vw]">{toast}</div>}
    </div>
  )
}

// ───────────────────────── Add / Drop ─────────────────────────
function AddDrop({ data, L, busy, setBusy, leagueId, reload, toast }: { data: Data; L: (typeof YSF_LEAGUES)[number]; busy: boolean; setBusy: (b: boolean) => void; leagueId: string; reload: () => Promise<void>; toast: (s: string) => void }) {
  const [q, setQ] = useState('')
  const [pf, setPf] = useState('ALL')
  const [srt, setSrt] = useState<'points' | 'avg' | 'gp' | 'name'>('points')
  const [dir, setDir] = useState(-1)
  const [open, setOpen] = useState<string | null>(null)
  const [bid, setBid] = useState(1)
  const [drop, setDrop] = useState('')
  const filters = ['ALL', ...((ORDER[data.sport] ?? []).filter(k => !['UTIL', 'RB/WR/TE'].includes(k)))]
  const activeMax = Object.entries(data.slots).reduce((a, [k, n]) => a + (['IR', 'TAXI', 'IL', 'DL'].includes(k) ? 0 : n), 0)
  const full = data.roster.filter(p => !['IR', 'TAXI'].includes(p.slot)).length >= activeMax
  const rows = useMemo(() => {
    const v = (p: FA) => srt === 'name' ? p.name.split(' ').slice(-1)[0] : srt === 'avg' ? (p.gp ? p.points / p.gp : -1e9) : srt === 'gp' ? p.gp : p.points
    return data.freeAgents.filter(p => (pf === 'ALL' || positionsOf(p).some(x => slotEligible(x, pf))) && (!q || p.name.toLowerCase().includes(q.toLowerCase())))
      .sort((a, b) => { const x = v(a), y = v(b); return (x < y ? -1 : x > y ? 1 : 0) * dir }).slice(0, 100)
  }, [data.freeAgents, pf, q, srt, dir])
  const sortBy = (k: typeof srt) => { if (srt === k) setDir(-dir); else { setSrt(k); setDir(k === 'name' ? 1 : -1) } }
  // waiver players are claimed (FAAB bid, processed at the waiver run); free agents are added now
  const submit = async (p: FA) => {
    if (full && !drop) return toast('Your roster is full — choose a player to drop')
    setBusy(true)
    const dropP = data.roster.find(r => r.rosterId === drop)
    const r = p.clears
      ? await fetch(`/api/leagues/${leagueId}/waivers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'SUBMIT', addPlayerId: p.playerId, dropPlayerId: dropP?.playerId, bidAmount: bid }) })
      : await fetch(`/api/teams/${data.team.id}/roster`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'ADD', playerId: p.playerId, dropRosterId: dropP?.rosterId }) })
    const j = await r.json().catch(() => ({}))
    toast(r.ok ? (p.clears ? `Claim submitted: ${p.name} for $${bid}` : `${p.name} added`) : (j.error || (p.clears ? 'Claim failed' : 'Add failed')))
    setOpen(null); setBusy(false); await reload()
  }
  const H = ({ k, l, w, right }: { k: typeof srt; l: string; w?: string; right?: boolean }) => (
    <button onClick={() => sortBy(k)} className={`ui inline-flex items-center gap-[3px] h-8 ${right ? 'justify-end' : ''} ${w ?? ''}`} style={{ color: srt === k ? '#000' : '#4A4A4A', fontWeight: srt === k ? 700 : 500 }}>{l}<span className="text-[10px]">{srt === k ? (dir > 0 ? '▲' : '▼') : ''}</span></button>
  )
  return (
    <section className="flex flex-col gap-3.5">
      <div className="flex flex-wrap gap-2.5 items-center">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search players" className="flex-1 min-w-[220px] h-11 px-3.5 border border-black rounded-lg font-semibold" />
        <div className="flex flex-wrap gap-1">{filters.map(f => <button key={f} onClick={() => setPf(f)} className={`${btn} h-9 min-w-[44px] px-2.5 border`} style={{ borderColor: f === pf ? '#000' : '#C7C7C7', background: f === pf ? '#000' : '#fff', color: f === pf ? '#fff' : '#000' }}>{posFix(f)}</button>)}</div>
      </div>
      <div className="card overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 py-1.5 border-b-2 border-black text-[12px] tracking-[.1em]">
          <H k="name" l="PLAYER" w="flex-1" /><H k="gp" l="GP" w="hidden sm:inline-flex w-10" right /><H k="points" l="FPTS" w="w-[58px]" right /><H k="avg" l="AVG" w="w-[50px]" right /><span className="w-[84px]" />
        </div>
        {rows.map(p => (
          <div key={p.playerId} className="border-t border-ink-50">
            <div className="flex items-center gap-2.5 px-4 py-2">
              <span className="flex-1 min-w-0 font-bold">{p.name}{p.injury && <> <span className="ui inline-flex items-center justify-center leading-none h-[18px] px-[5px] rounded-[2px] bg-[#ba0c2f] text-white text-[10px] font-bold align-[2px]">{injTagOf(p.injury)}</span></>}<span className="block font-normal text-[13px] text-ink-500">{meta(data.code, p.team, p.pos)}</span><span className={`mt-1 ui inline-flex items-center h-[20px] px-1.5 rounded-[2px] text-[10px] font-bold leading-none text-white ${p.clears ? 'bg-[#2F5D8A]' : 'bg-black'}`}>{p.clears ? `WAIVERS · ${new Date(p.clears).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'FREE AGENT'}</span></span>
              <span className="hidden sm:inline w-10 text-right tabular-nums text-ink-500 font-semibold">{p.gp || '—'}</span>
              <span className="w-[58px] text-right tabular-nums font-bold">{p.points.toFixed(1)}</span>
              <span className="w-[50px] text-right tabular-nums font-semibold">{p.gp ? (p.points / p.gp).toFixed(1) : '—'}</span>
              <button disabled={busy || p.pending} onClick={() => { setOpen(open === p.playerId ? null : p.playerId); setBid(1); setDrop('') }} className={`${btn} w-[84px] h-8 border border-black`} style={{ background: open === p.playerId ? '#000' : '#fff', color: open === p.playerId ? '#fff' : '#000' }}>{p.pending ? 'PENDING' : p.clears ? 'CLAIM' : 'ADD'}</button>
            </div>
            {open === p.playerId && (
              <div className="flex flex-wrap gap-3 items-end px-4 pt-3 pb-4 bg-ink-50">
                {p.clears && <label className="flex flex-col gap-1.5"><span className="ui text-[11px] text-ink-500">BID (OF ${data.faab})</span>
                  <input type="number" min={0} max={data.faab} value={bid} onChange={e => setBid(Math.max(0, Math.min(data.faab, Math.floor(+e.target.value || 0))))} className="w-[110px] h-11 px-3 border border-black rounded-lg font-bold" /></label>}
                <label className="flex flex-col gap-1.5 flex-1 min-w-[220px]"><span className="ui text-[11px] text-ink-500">{full ? `DROP (ROSTER FULL)` : 'DROP'}</span>
                  <select value={drop} onChange={e => setDrop(e.target.value)} className="h-11 px-3 border border-black rounded-lg bg-white font-semibold">
                    <option value="">{full ? 'Choose a player to drop' : 'No drop'}</option>
                    {data.roster.filter(r => !['IR', 'TAXI'].includes(r.slot)).map(r => <option key={r.rosterId} value={r.rosterId}>{r.name} {meta(data.code, r.team, r.pos)}</option>)}
                  </select></label>
                <div className="flex gap-2">
                  <button onClick={() => setOpen(null)} className={`${btn} h-11 px-4 border border-black bg-white text-black text-[13px]`}>CANCEL</button>
                  <button disabled={busy} onClick={() => submit(p)} className={`${btn} h-11 px-4 text-white text-[13px]`} style={{ background: full && !drop ? '#8A8A8A' : '#000' }}>{p.clears ? 'SUBMIT CLAIM' : 'ADD PLAYER'}</button>
                </div>
              </div>
            )}
          </div>
        ))}
        {!rows.length && <div className="p-4 text-ink-400 font-semibold">No free agents match</div>}
      </div>
    </section>
  )
}

// ───────────────────────── Trade ─────────────────────────
type Item = { id: string; kind: 'player' | 'pick' | 'faab'; sport: string; label: string; amount?: number }
function Trade({ data, leagueId, toast, onSent }: { data: Data; leagueId: string; toast: (s: string) => void; onSent: () => void }) {
  const [partner, setPartner] = useState(data.clubs[0]?.id ?? '')
  const [assets, setAssets] = useState<Record<string, Item[]>>({})
  const [gl, setGl] = useState(data.sport), [tl, setTl] = useState(data.sport)
  const [give, setGive] = useState<Item[]>([]), [get, setGet] = useState<Item[]>([])
  const [busy, setBusy] = useState(false)
  const codeOf = (s: string) => data.sports.find(x => x.sport === s)?.code ?? s
  const abOf = (tid: string) => (tid === data.team.id ? data.team : data.clubs.find(c => c.id === tid))?.abbreviation ?? ''
  const loadAssets = useCallback(async (tid: string) => {
    if (assets[tid]) return
    const r = await fetch(`/api/teams/${tid}/roster`); const j = await r.json()
    const items: Item[] = [
      ...(j.players ?? []).map((p: any) => ({ id: p.id, kind: 'player', sport: p.sport, label: `${p.name} ${meta(codeOf(p.sport), p.realTeamAbbr, p.position)}` })),
      ...(j.picks ?? []).filter((k: any) => k.tradeable !== false).map((k: any) => ({ id: k.id, kind: 'pick', sport: k.sport ?? 'PICKS', label: `${k.year} ${k.sport ? codeOf(k.sport) : 'Federation'} Round ${k.round} pick${k.originalTeamId !== tid ? ` (via ${abOf(k.originalTeamId)})` : ''}` })),
    ]
    setAssets(a => ({ ...a, [tid]: items }))
  }, [assets]) // eslint-disable-line
  useEffect(() => { loadAssets(data.team.id) }, []) // eslint-disable-line
  useEffect(() => { if (partner) loadAssets(partner) }, [partner]) // eslint-disable-line
  const club = data.clubs.find(c => c.id === partner)
  const side = (tid: string, l: string, list: Item[], set: (x: Item[]) => void) => (assets[tid] ?? [])
    .filter(i => l === 'PICKS' ? i.kind === 'pick' : i.kind === 'player' && i.sport === l)
    .map(i => { const on = list.some(x => x.id === i.id); return { i, on, toggle: () => set(on ? list.filter(x => x.id !== i.id) : [...list, i]) } })
  const LgSel = ({ cur, set }: { cur: string; set: (s: string) => void }) => (
    <div className="flex flex-wrap gap-1 px-4 pb-3">
      {[...data.sports.map(s => s.sport), 'PICKS', 'FAAB'].map(s => { const on = cur === s; const c = s === 'PICKS' || s === 'FAAB' ? '#000' : lg(s).color; return (
        <button key={s} onClick={() => set(s)} className={`${btn} h-8 px-2.5 border text-[11px]`} style={{ borderColor: on ? c : '#C7C7C7', background: on ? c : '#fff', color: on ? '#fff' : '#000' }}><span className="ysf-case">{s === 'PICKS' || s === 'FAAB' ? s : codeOf(s)}</span></button>) })}
    </div>
  )
  const propose = async () => {
    if (!give.length || !get.length) return
    setBusy(true)
    const one = (i: Item, from: string, to: string) => i.kind === 'faab' ? { faabSport: i.sport, faabAmount: i.amount, fromTeamId: from, toTeamId: to } : { [i.kind === 'pick' ? 'pickId' : 'playerId']: i.id, fromTeamId: from, toTeamId: to }
    const items = [...give.map(i => one(i, data.team.id, partner)), ...get.map(i => one(i, partner, data.team.id))]
    const r = await fetch('/api/trades', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leagueId, recipientTeamId: partner, items }) })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) return toast(j.error || 'Trade could not be sent')
    toast(`Trade offer sent to ${club?.abbreviation}`); setGive([]); setGet([]); onSent()
  }
  // FAAB can be traded (Art. IV §A): an amount from any league's budget
  const FaabRows = ({ tid, list, set }: { tid: string; list: Item[]; set: (x: Item[]) => void }) => (
    <div className="flex flex-col">
      {data.sports.map(sp => {
        const cur = list.find(x => x.kind === 'faab' && x.sport === sp.sport)
        return (
          <label key={sp.sport} className="grid grid-cols-[minmax(0,1fr)_110px] gap-2.5 items-center px-4 py-2 border-t border-ink-50">
            <span className="font-bold"><span className="ysf-case">{sp.code}</span> FAAB</span>
            <span className="relative"><span className="absolute left-2.5 top-1/2 -translate-y-1/2 font-bold text-ink-500">$</span>
              <input type="number" min={0} max={250} inputMode="numeric" defaultValue={cur?.amount ?? ''} key={`${tid}-${sp.sport}-${cur?.amount ?? 0}`}
                onBlur={e => { const v = Math.max(0, Math.floor(+e.target.value || 0)); const rest = list.filter(x => !(x.kind === 'faab' && x.sport === sp.sport))
                  set(v ? [...rest, { id: `faab-${tid}-${sp.sport}`, kind: 'faab', sport: sp.sport, amount: v, label: `$${v} ${sp.code} FAAB` }] : rest) }}
                className="input w-full pl-6 text-right font-bold" placeholder="0" /></span>
          </label>
        )
      })}
    </div>
  )
  const Panel = ({ tid, kick, name, logo, cc, l, setL, list, set }: any) => (
    <div className="card overflow-hidden" style={{ borderTop: `4px solid ${cc}` }}>
      <div className="flex items-center gap-2.5 px-4 py-3">
        {logo && <span className="w-8 h-8 inline-flex items-center justify-center"><img src={logo} alt="" className="w-8 h-8 object-contain" /></span>}
        <div><div className="ui text-[11px] text-ink-500">{kick}</div><div className="disp text-[22px] font-extrabold leading-none">{name}</div></div>
        <span className="ui ml-auto text-[12px] font-bold">{list.length} SELECTED</span>
      </div>
      <LgSel cur={l} set={setL} />
      {l === 'FAAB' && <FaabRows tid={tid} list={list} set={set} />}
      {l !== 'FAAB' && !assets[tid] && <div className="px-4 py-3 text-ink-400">Loading…</div>}
      {l !== 'FAAB' && side(tid, l, list, set).map(({ i, on, toggle }) => (
        <button key={i.id} onClick={toggle} className="grid grid-cols-[22px_minmax(0,1fr)] gap-2.5 items-center w-full text-left px-4 py-2 border-t border-ink-50" style={{ background: on ? '#F2F2F2' : '#fff' }}>
          <span className="w-5 h-5 rounded-[3px] border-2 border-black inline-flex items-center justify-center text-[13px] leading-none" style={{ background: on ? '#000' : '#fff', color: '#fff' }}>{on ? '✓' : ''}</span>
          <span className="font-bold min-w-0">{i.label}</span>
        </button>
      ))}
    </div>
  )
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5">
        {data.clubs.map(c => { const on = c.id === partner; return (
          <button key={c.id} onClick={() => { setPartner(c.id); setGet([]) }} className={`${btn} gap-2 h-11 pl-2 pr-3 border-2 text-[13px]`} style={{ borderColor: c.primaryColor ?? '#000', background: on ? c.primaryColor ?? '#000' : '#fff', color: on ? '#fff' : '#000' }}>
            <span className="w-[26px] h-[26px] inline-flex items-center justify-center"><img src={(on ? c.altLogo || c.logo : c.logo || c.altLogo)!} alt="" className="w-[26px] h-[26px] object-contain" /></span>{c.abbreviation}</button>) })}
      </div>
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <Panel tid={data.team.id} kick="YOU GIVE" name={data.team.name} logo={data.team.logo} cc={data.team.primaryColor} l={gl} setL={setGl} list={give} set={setGive} />
        {club && <Panel tid={club.id} kick="YOU GET" name={club.name} logo={club.logo} cc={club.primaryColor} l={tl} setL={setTl} list={get} set={setGet} />}
      </div>
      <div className="card p-4 flex flex-col gap-3" style={{ borderTop: '4px solid #000' }}>
        <div className="ui text-[12px] font-bold tracking-[.12em]">TRADE SUMMARY</div>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          {[[`${data.team.abbreviation} GIVES`, give], [`${club?.abbreviation ?? ''} GIVES`, get]].map(([k, list]: any) => (
            <div key={k}><div className="ui text-[11px] text-ink-500 mb-1.5">{k}</div>
              {list.length ? list.map((i: Item) => <div key={i.id} className="flex items-center gap-2 py-1"><span className="ui inline-flex items-center justify-center leading-none h-[22px] px-1.5 rounded-[2px] text-white text-[11px] font-bold" style={{ background: i.sport === 'PICKS' || i.kind === 'faab' ? '#000' : lg(i.sport).color }}><span className="ysf-case">{i.sport === 'PICKS' ? 'PICK' : i.kind === 'faab' ? 'FAAB' : codeOf(i.sport)}</span></span><span className="font-bold">{i.label}</span></div>)
                : <div className="text-ink-400 font-semibold">Nothing selected</div>}</div>
          ))}
        </div>
        <div className="flex justify-end"><button disabled={busy || !give.length || !get.length} onClick={propose} className={`${btn} h-12 px-5 text-white text-[14px]`} style={{ background: give.length && get.length ? '#000' : '#8A8A8A' }}>PROPOSE TRADE</button></div>
      </div>
    </section>
  )
}

// ───────────────────────── Pending ─────────────────────────
function Pending({ data, leagueId, reload, toast }: { data: Data; leagueId: string; reload: () => Promise<void>; toast: (s: string) => void }) {
  const [trades, setTrades] = useState<any[] | null>(null)
  const loadT = useCallback(async () => {
    const r = await fetch('/api/trades'); const j = await r.json().catch(() => [])
    setTrades((Array.isArray(j) ? j : []).filter((t: any) => t.leagueId === leagueId && (t.status === 'PENDING' || t.status === 'REVIEW')))
  }, [leagueId])
  useEffect(() => { loadT() }, [loadT])
  const cancelClaim = async (id: string) => {
    const r = await fetch(`/api/leagues/${leagueId}/waivers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'CANCEL', claimId: id }) })
    toast(r.ok ? 'Claim cancelled' : 'Could not cancel'); await reload()
  }
  const act = async (id: string, action: 'CANCEL' | 'ACCEPT' | 'REJECT') => {
    const r = await fetch(`/api/trades/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
    const j = await r.json().catch(() => ({}))
    toast(r.ok ? (action === 'CANCEL' ? 'Offer withdrawn' : action === 'ACCEPT' ? 'Trade accepted' : 'Trade rejected') : (j.error || 'Could not update the trade'))
    await loadT(); await reload()
  }
  const code = (s: string | null) => data.sports.find(x => x.sport === s)?.code ?? (s || '')
  const Head = ({ t }: { t: string }) => <div className="ui px-4 py-2.5 border-b-2 border-black text-[12px] font-bold tracking-[.12em]">{t}</div>
  return (
    <section className="flex flex-col gap-4">
      <div className="card overflow-hidden">
        <Head t={`WAIVER CLAIMS · ${data.code}`} />
        {data.claims.map((c, i) => (
          <div key={c.id} className="grid grid-cols-[28px_minmax(0,1fr)_64px_auto] gap-3 items-center px-4 py-2.5 border-t border-ink-50">
            <span className="font-bold text-ink-500">{i + 1}</span>
            <span className="min-w-0"><span className="font-bold">+ {c.add?.name}</span> <span className="text-[13px] text-ink-500">{c.add ? meta(data.code, c.add.team, c.add.position) : ''}</span>{c.drop && <span className="block text-[13px] text-ink-500">− {c.drop.name}</span>}</span>
            <span className="disp text-[20px] font-extrabold text-right">${c.bid}</span>
            <button onClick={() => cancelClaim(c.id)} className={`${btn} h-8 px-3 border border-black bg-white text-black`}>CANCEL</button>
          </div>
        ))}
        {!data.claims.length && <div className="p-4 text-ink-400 font-semibold">No pending claims</div>}
      </div>
      <div className="card overflow-hidden">
        <Head t="TRADE OFFERS" />
        {trades === null && <div className="p-4 text-ink-400">Loading…</div>}
        {trades?.map(t => {
          const mineSent = t.initiatorTeam?.id === data.team.id
          const other = mineSent ? t.recipientTeam : t.initiatorTeam
          const side = (fromMe: boolean) => t.items.filter((it: any) => (it.fromTeamId === data.team.id) === fromMe)
            .map((it: any) => it.player ? `${it.player.name} (${code(it.player.sport)})` : it.pick ? `${it.pick.year} ${code(it.pick.sport)} Round ${it.pick.round} pick` : it.faabAmount ? `$${it.faabAmount} ${code(it.faabSport)} FAAB` : '').join(', ')
          return (
            <div key={t.id} className="grid grid-cols-[40px_minmax(0,1fr)_auto] gap-3 items-center px-4 py-3 border-t border-ink-50" style={{ borderLeft: `4px solid ${other?.primaryColor ?? '#000'}` }}>
              <span className="w-8 h-8 inline-flex items-center justify-center">{other?.logo && <img src={other.logo} alt="" className="w-8 h-8 object-contain" />}</span>
              <span className="min-w-0"><span className="ui text-[11px] text-ink-500">{t.status === 'REVIEW' ? `WITH ${other?.abbreviation} · IN REVIEW UNTIL ${new Date(t.reviewDeadline).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).toUpperCase()} ET` : mineSent ? `SENT TO ${other?.abbreviation} · AWAITING RESPONSE` : `FROM ${other?.abbreviation}`}</span>
                <span className="block font-bold">You give: {side(true) || '—'}</span><span className="block font-bold">You get: {side(false) || '—'}</span></span>
              <span className="flex gap-1.5">
                {t.status === 'REVIEW' ? null : mineSent ? <button onClick={() => act(t.id, 'CANCEL')} className={`${btn} h-8 px-3 border border-black bg-white text-black`}>WITHDRAW</button>
                  : <><button onClick={() => act(t.id, 'ACCEPT')} className={`${btn} h-8 px-3 bg-black text-white`}>ACCEPT</button><button onClick={() => act(t.id, 'REJECT')} className={`${btn} h-8 px-3 border border-black bg-white text-black`}>REJECT</button></>}
              </span>
            </div>
          )
        })}
        {trades && !trades.length && <div className="p-4 text-ink-400 font-semibold">No open offers</div>}
      </div>
    </section>
  )
}
