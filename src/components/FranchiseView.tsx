'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { sportMeta } from '@/lib/utils'
import { useSportAbbr } from '@/components/SportNaming'
import { eligibleSlots, SPORT_POSITIONS } from '@/lib/defaults'
import { lineupAdvice } from '@/lib/lineup'
import { oppLabel } from '@/lib/realschedule'

type P = {
  rosterId: string; slot: string; sport: string; onBlock?: boolean; isKeeper?: boolean; salary?: number; contractYears?: number | null; id: string; name: string; position: string
  realTeam: string; realTeamAbbr: string | null; status: string; injuryNote: string | null; byeWeek: number | null
  seasonPoints: number; projectedPoints: number; weeklyAvg: number; seasonPtsActual?: number
  gp: number; lastPts: number | null; seasonStats: Record<string, number>; opp: { opp: string; home: boolean } | null
  locked?: boolean; kickoff?: number | null; gameDate?: string | null
}
type Pick = { id: string; sport: string | null; round: number; year: number }
type Team = { id: string; name: string; abbreviation: string; logo: string | null; altLogo: string | null; wordmark: string | null; primaryColor: string; secondaryColor: string; leagueId: string; userId: string; ownerName: string | null }
type FA = { id: string; name: string; position: string; realTeam: string; seasonPoints: number; status: string }

const SPORTS = ['NFL', 'NHL', 'NBA', 'MLB']
const STARTER = (slot: string) => !['BN', 'IR', 'IL', 'DL', 'TAXI'].includes(slot)
// Canonical position/slot order per sport (used to sort the roster and the lineup).
const SLOT_ORDER: Record<string, string[]> = {
  NFL: ['QB', 'RB', 'WR', 'TE', 'RB/WR/TE', 'WR/RB', 'FLEX', 'OP', 'DEF', 'D/ST', 'DST', 'K'],
  NBA: ['PG', 'SG', 'SF', 'PF', 'C', 'G', 'F', 'UTIL'],
  NHL: ['C', 'LW', 'RW', 'D', 'G', 'UTIL'],
  MLB: ['C', '1B', '2B', '3B', 'SS', 'OF', 'LF', 'CF', 'RF', 'UTIL', 'SP', 'RP', 'P'],
}

export default function FranchiseView({ teamId }: { teamId: string }) {
  const id = teamId
  const abbr = useSportAbbr()
  const [data, setData] = useState<any>(null)
  const [history, setHistory] = useState<any>(null)
  const [sport, setSport] = useState('NFL')
  const [view, setView] = useState<'roster' | 'history'>('roster')
  const [lineupDate, setLineupDate] = useState<string | null>(null) // null = standing lineup (daily sports only)
  const [fa, setFa] = useState<FA[]>([])
  const [showFA, setShowFA] = useState(false)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [brand, setBrand] = useState<any>({})
  // Tap-to-assign selection: either a player being moved, or an open slot being filled.
  const [sel, setSel] = useState<{ k: 'player'; id: string } | { k: 'slot'; slot: string; idx: number } | null>(null)
  const [showMgr, setShowMgr] = useState(false)
  const [mgrEmail, setMgrEmail] = useState('')
  const [mgrErr, setMgrErr] = useState('')
  const [contract, setContract] = useState<{ p: P; salary: string; years: string } | null>(null)

  const load = useCallback(() => {
    fetch(`/api/teams/${id}/roster`).then(r => r.json()).then(d => {
      setData(d)
      // Keep the current sport tab if it still has players; only fall back on first load.
      setSport(prev => {
        const present = SPORTS.filter(s => (d.players ?? []).some((p: P) => p.sport === s))
        return present.includes(prev) ? prev : (present[0] ?? prev)
      })
      setLoading(false)
    })
  }, [id])

  useEffect(() => { load() }, [load])
  // Live scoring: while the league is in live mode and this tab is visible,
  // re-pull the roster every 45s so in-game scores refresh without a manual
  // reload. This only re-reads the DB (no provider calls) — actual freshness
  // still depends on how often the ingestion cron runs.
  useEffect(() => {
    if (!data?.liveScoring) return
    const tick = () => { if (document.visibilityState === 'visible') load() }
    const iv = setInterval(tick, 45_000)
    document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', tick) }
  }, [data?.liveScoring, load])
  useEffect(() => { fetch(`/api/teams/${id}/history`).then(r => r.json()).then(setHistory) }, [id])
  useEffect(() => {
    if (showFA && data?.team) fetch(`/api/players?sport=${sport}&free=true&leagueId=${data.team.leagueId}`).then(r => r.json()).then(setFa)
  }, [showFA, sport, data?.team])
  // For daily-cadence sports, default the lineup date to today (if in this week) or
  // the week's first day; weekly sports clear it (single standing lineup).
  useEffect(() => {
    const dates: string[] = data?.weekDates?.[sport] ?? []
    if ((data?.cadence?.[sport]) === 'DAILY' && dates.length) {
      const now = new Date()
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      setLineupDate(prev => (prev && dates.includes(prev)) ? prev : (dates.includes(today) ? today : dates[0]))
    } else setLineupDate(null)
  }, [sport, data])

  async function act(payload: any) {
    await fetch(`/api/teams/${id}/roster`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    load()
  }

  async function saveBranding() {
    await fetch(`/api/teams/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(brand) })
    setEditing(false); load()
  }

  async function addManager() {
    setMgrErr('')
    const r = await fetch(`/api/teams/${id}/managers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: mgrEmail }) })
    if (!r.ok) { setMgrErr((await r.json().catch(() => ({}))).error ?? 'Failed to add'); return }
    setMgrEmail(''); load()
  }
  async function removeManager(userId: string) {
    await fetch(`/api/teams/${id}/managers`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) })
    load()
  }

  async function saveContract() {
    if (!contract) return
    await act({ action: 'SET_CONTRACT', rosterId: contract.p.rosterId, salary: Number(contract.salary) || 0, contractYears: contract.years.trim() === '' ? null : Number(contract.years) })
    setContract(null)
  }

  if (loading) return (
    <div className="max-w-5xl mx-auto px-4 py-8 animate-pulse">
      <div className="h-28 rounded-2xl bg-slate-100 mb-6" />
      <div className="flex gap-2 mb-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-8 w-24 rounded-full bg-slate-100" />)}</div>
      <div className="card divide-y divide-slate-50">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-9 bg-slate-50 m-2 rounded" />)}</div>
    </div>
  )
  if (!data?.team) return <div className="text-center py-20 text-slate-400">Club not found.</div>

  const team: Team = data.team
  const players: P[] = data.players ?? []
  const picks: Pick[] = data.picks ?? []
  const canManage: boolean = data.canManage
  const sportsPresent = SPORTS.filter(s => players.some(p => p.sport === s))
  // Daily-cadence sports manage a lineup per calendar day. With a date selected,
  // each player's effective slot is that day's override (falling back to the
  // standing slot); roster moves write to that day only.
  const cadence: Record<string, string> = data.cadence ?? {}
  const isDaily = cadence[sport] === 'DAILY'
  const weekDays: string[] = data.weekDates?.[sport] ?? []
  const dayMap: Record<string, string> | null = (isDaily && lineupDate) ? (data.dailyLineups?.[sport]?.[lineupDate] ?? {}) : null
  const rosterForSport = players.filter(p => p.sport === sport)
    .map(p => dayMap ? { ...p, slot: dayMap[p.id] ?? p.slot } : p)
    .sort((a, b) => (STARTER(b.slot) ? 1 : 0) - (STARTER(a.slot) ? 1 : 0) || b.seasonPoints - a.seasonPoints)
  const dayLabel = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'numeric', day: 'numeric' }) }
  const playsOn = (d: string) => players.filter(p => p.sport === sport && p.gameDate === d).length
  const picksForSport = picks.filter(p => p.sport === sport || p.sport === null)
  const capEnabled: boolean = !!data.salaryCapEnabled
  const cap: number = data.salaryCap ?? 0
  const totalSalary = players.reduce((s, p) => s + (p.salary ?? 0), 0)
  const overCap = capEnabled && cap > 0 && totalSalary > cap

  const cfg: Record<string, number> = (data.rosterSettings ?? {})[sport] ?? {}
  const RESERVE = ['BN', 'IR', 'IL', 'DL', 'TAXI']
  const order = SLOT_ORDER[sport] ?? []
  const rank = (s: string) => { const i = order.indexOf(s); return i === -1 ? 99 : i }

  // Starting lineup: every configured starter slot in position order, filled or empty,
  // so e.g. an empty K slot always shows. Players still move via the slot dropdown.
  const bySlot: Record<string, P[]> = {}
  for (const p of rosterForSport.filter(p => STARTER(p.slot))) (bySlot[p.slot] ??= []).push(p)
  for (const k in bySlot) bySlot[k].sort((a, b) => (b.seasonPoints ?? 0) - (a.seasonPoints ?? 0))
  const starterSlots = Object.keys(cfg).filter(k => !RESERVE.includes(k)).sort((a, b) => rank(a) - rank(b))
  const lineup: { slot: string; player: P | null }[] = []
  for (const slot of starterSlots) for (let i = 0; i < (cfg[slot] || 0); i++) lineup.push({ slot, player: bySlot[slot]?.shift() ?? null })
  for (const p of Object.values(bySlot).flat()) lineup.push({ slot: p.slot, player: p }) // any extras

  const byPos = (a: P, b: P) => rank(a.position) - rank(b.position) || (b.seasonPoints ?? 0) - (a.seasonPoints ?? 0)
  const bench = rosterForSport.filter(p => p.slot === 'BN').sort(byPos)
  const taxi = rosterForSport.filter(p => p.slot === 'TAXI').sort(byPos)
  const ir = rosterForSport.filter(p => ['IR', 'IL', 'DL'].includes(p.slot)).sort(byPos)

  // ── Lineup advisor: optimal projected lineup + start/sit suggestions ──────────
  // A starter who's on bye or inactive this week projects 0, so the optimizer will
  // want to bench them. Projection is the static per-player projection we store.
  const curWeek: number | undefined = data.week ?? undefined
  const isOut = (p: P) => p.status !== 'ACTIVE' || (curWeek != null && p.byeWeek === curWeek)
  const effProj = (p: P) => isOut(p) ? 0 : (p.projectedPoints ?? 0)
  const advisor = (() => {
    const startable = rosterForSport.filter(p => !RESERVE.includes(p.slot) || p.slot === 'BN')
    const slotInstances: string[] = []
    for (const slot of starterSlots) for (let i = 0; i < (cfg[slot] || 0); i++) slotInstances.push(slot)
    if (!slotInstances.length) return null
    const positions = SPORT_POSITIONS[sport] ?? []
    const slotWidth = (slot: string) => positions.filter(pos => eligibleSlots(pos, cfg).includes(slot)).length || 99
    const byId = new Map(startable.map(p => [p.rosterId, p]))
    const currentIds = new Set(lineup.filter(e => e.player).map(e => e.player!.rosterId))
    const adv = lineupAdvice(
      startable.map(p => ({ id: p.rosterId, position: p.position, proj: p.projectedPoints ?? 0, out: isOut(p) })),
      currentIds, slotInstances, pos => eligibleSlots(pos, cfg), slotWidth,
    )
    const toP = (o: { id: string }) => byId.get(o.id)!
    return {
      currentTotal: adv.currentTotal, optimalTotal: adv.optimalTotal, gain: adv.gain,
      toStart: adv.toStart.map(a => ({ player: toP(a.player), slot: a.slot })),
      toSit: adv.toSit.map(toP), alerts: adv.alerts.map(toP),
    }
  })()

  // ── Tap-to-assign lineup ────────────────────────────────────────────────────
  // Positions stay put; you tap a player then tap a slot (or a slot then a
  // player) to move them in. No dropdowns — friendlier on touch.
  const elig = (p: P) => eligibleSlots(p.position, cfg)
  const selPlayer = sel?.k === 'player' ? rosterForSport.find(p => p.rosterId === sel.id) ?? null : null
  const selSlot = sel?.k === 'slot' ? sel : null
  const canPlace = (p: P, slot: string) => elig(p).includes(slot)
  const isLocked = (p: P) => !!p.locked && !data.isCommish

  const post = (payload: any) => fetch(`/api/teams/${id}/roster`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  async function assign(rosterId: string, slot: string, displaceRosterId?: string) {
    const d = dayMap ? { date: lineupDate } : {}
    if (displaceRosterId && displaceRosterId !== rosterId) {
      // Bench the displaced player first; abort the whole move if that's rejected
      // (e.g. a full bench with roster overflow disabled), so nobody double-fills a slot.
      const dr = await post({ action: 'SET_SLOT', rosterId: displaceRosterId, slot: 'BN', ...d })
      if (!dr.ok) { const e = await dr.json().catch(() => ({})); if (e?.error) alert(e.error); setSel(null); return }
    }
    const r = await post({ action: 'SET_SLOT', rosterId, slot, ...d })
    if (!r.ok) { const e = await r.json().catch(() => ({})); if (e?.error) alert(e.error) }
    setSel(null); load()
  }
  // Swap two players' slots directly (e.g. tap a starter, then a bench player to
  // sit the starter and start the other). Each must be eligible for the other's slot.
  async function swapSlots(x: P, y: P) {
    const d = dayMap ? { date: lineupDate } : {}
    await post({ action: 'SET_SLOT', rosterId: x.rosterId, slot: y.slot, ...d })
    const r = await post({ action: 'SET_SLOT', rosterId: y.rosterId, slot: x.slot, ...d })
    if (!r.ok) { const e = await r.json().catch(() => ({})); if (e?.error) alert(e.error) }
    setSel(null); load()
  }
  // Reserve slots (Bench / IR / Taxi) this league configures that the selected
  // player can go to — shown as quick targets in the move banner.
  const reserveTargets = selPlayer
    ? Object.keys(cfg).filter(s => RESERVE.includes(s) && s !== selPlayer.slot && canPlace(selPlayer, s))
    : []
  const reserveLabel = (s: string) => s === 'BN' ? 'Bench' : s === 'TAXI' ? 'Taxi' : s
  // Tap a lineup slot (filled or empty).
  function tapSlot(slot: string, idx: number, occupant: P | null) {
    if (!canManage) return
    if (selPlayer) {
      if (isLocked(selPlayer) || !canPlace(selPlayer, slot)) return
      if (occupant && occupant.rosterId === selPlayer.rosterId) { setSel(null); return }
      assign(selPlayer.rosterId, slot, occupant?.rosterId); return
    }
    if (occupant) { if (isLocked(occupant)) return; setSel({ k: 'player', id: occupant.rosterId }); return }
    setSel(selSlot && selSlot.slot === slot && selSlot.idx === idx ? null : { k: 'slot', slot, idx })
  }
  // Tap a bench/reserve player.
  function tapPlayer(p: P) {
    if (!canManage || isLocked(p)) return
    if (selSlot) {
      if (!canPlace(p, selSlot.slot)) return
      assign(p.rosterId, selSlot.slot, lineup[selSlot.idx]?.player?.rosterId); return
    }
    // A player is already selected → swap the two (bench a starter by tapping a
    // bench player, promote a bench player by tapping a starter, or swap two
    // starters), as long as each is eligible for the other's slot.
    if (selPlayer && selPlayer.rosterId !== p.rosterId && !isLocked(selPlayer)
        && canPlace(selPlayer, p.slot) && canPlace(p, selPlayer.slot)) {
      swapSlots(selPlayer, p); return
    }
    setSel(selPlayer && selPlayer.rosterId === p.rosterId ? null : { k: 'player', id: p.rosterId })
  }

  // The player's identity + key numbers, shared by slot and reserve cards.
  const playerBits = (p: P) => (
    <>
      <span className="flex-1 min-w-0">
        <span className="font-medium text-sm text-slate-900 truncate block">{p.name}</span>
        <span className="text-[11px] text-slate-400">
          {p.position} · {p.realTeamAbbr ?? p.realTeam}
          {p.opp ? <> · {oppLabel(p.opp)}</> : null}
          {p.status !== 'ACTIVE' && <span className="ml-1 font-bold text-red-500">{p.status === 'INJURED' ? 'INJ' : p.status}</span>}
          {p.byeWeek ? <span className="ml-1 text-slate-300">BYE {p.byeWeek}</span> : null}
          {dayMap && p.gameDate === lineupDate && <span className="ml-1 font-bold text-emerald-500">PLAYS</span>}
          {dayMap && p.gameDate && p.gameDate !== lineupDate && <span className="ml-1 text-slate-300">off</span>}
          {capEnabled && (p.salary ?? 0) > 0 && <span className="ml-1 text-emerald-600 font-semibold tabular-nums">${(p.salary ?? 0).toLocaleString()}</span>}
        </span>
      </span>
      <span className="text-right flex-shrink-0 leading-tight">
        <span className="block text-sm font-bold tabular-nums text-slate-900">{(p.seasonPtsActual ?? 0).toFixed(1)}</span>
        <span className="block text-[10px] text-slate-400 tabular-nums">{p.gp ?? 0} GP · proj {(p.projectedPoints ?? 0).toFixed(1)}</span>
      </span>
    </>
  )

  const cardActions = (p: P) => canManage ? (
    <span className="flex items-center gap-1 flex-shrink-0 pr-2">
      {capEnabled && (data.isOwner || data.isCommish) && <button onClick={() => setContract({ p, salary: String(p.salary ?? 0), years: p.contractYears == null ? '' : String(p.contractYears) })} title="Salary / contract" className="text-[11px] w-6 h-6 rounded text-slate-400 hover:text-emerald-600">$</button>}
      <button onClick={() => act({ action: 'SET_BLOCK', rosterId: p.rosterId, onBlock: !p.onBlock })} title="Trade block" className={`text-[13px] w-6 h-6 rounded ${p.onBlock ? 'text-amber-600' : 'text-slate-300 hover:text-amber-600'}`}>{p.onBlock ? '◉' : '◎'}</button>
      <button onClick={() => act({ action: 'DROP', rosterId: p.rosterId })} title="Drop" className="text-[10px] font-semibold text-red-500 px-1.5 py-1 rounded border border-red-200 hover:bg-red-50">Drop</button>
    </span>
  ) : null

  // A starting-lineup slot: static position on the left, tap target on the right.
  const slotCard = (e: { slot: string; player: P | null }, idx: number) => {
    const p = e.player
    const targetable = !!selPlayer && !isLocked(selPlayer) && canPlace(selPlayer, e.slot) && selPlayer.rosterId !== p?.rosterId
    const picked = p && selPlayer?.rosterId === p.rosterId
    const dim = (selPlayer && !targetable && !picked) || (selSlot && selSlot.slot !== e.slot)
    return (
      <div key={`slot-${e.slot}-${idx}`}
        className={`flex items-center border-b border-slate-50 transition ${targetable ? 'bg-blue-50 ring-1 ring-inset ring-blue-300' : ''} ${picked ? 'bg-amber-50 ring-1 ring-inset ring-amber-300' : ''} ${dim ? 'opacity-45' : ''}`}>
        <button onClick={() => tapSlot(e.slot, idx, p)} disabled={!canManage || (!!p && isLocked(p))}
          className="flex-1 min-w-0 flex items-center gap-2.5 px-2.5 py-2.5 text-left">
          <span className={`w-11 flex-shrink-0 text-center text-[11px] font-black rounded py-1 ${STARTER(e.slot) ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{e.slot}</span>
          {p ? playerBits(p)
            : <span className="flex-1 text-xs italic text-slate-400">{targetable ? 'Tap to place here' : selSlot?.slot === e.slot ? 'Pick a highlighted player' : 'Empty'}</span>}
        </button>
        {p && cardActions(p)}
      </div>
    )
  }

  // A reserve player (bench / taxi / IR): the whole card is a tap target. It
  // highlights when it can fill a selected empty slot, OR when it's eligible to
  // swap into the currently-selected player's spot (and that player can take its
  // reserve spot) — so moving a starter lights up every legal swap partner.
  const reserveCard = (p: P) => {
    const targetable = !isLocked(p) && (
      (!!selSlot && canPlace(p, selSlot.slot)) ||
      (!!selPlayer && selPlayer.rosterId !== p.rosterId && !isLocked(selPlayer) && canPlace(p, selPlayer.slot) && canPlace(selPlayer, p.slot))
    )
    const picked = selPlayer?.rosterId === p.rosterId
    const dim = (selSlot && !targetable) || (selPlayer && !picked)
    return (
      <div key={p.rosterId}
        className={`flex items-center border-b border-slate-50 transition ${targetable ? 'bg-blue-50 ring-1 ring-inset ring-blue-300' : ''} ${picked ? 'bg-amber-50 ring-1 ring-inset ring-amber-300' : ''} ${dim ? 'opacity-45' : ''}`}>
        <button onClick={() => tapPlayer(p)} disabled={!canManage || isLocked(p)}
          className="flex-1 min-w-0 flex items-center gap-2.5 px-2.5 py-2.5 text-left">
          <span className="w-11 flex-shrink-0 text-center text-[10px] font-bold text-slate-400">{p.slot}</span>
          {playerBits(p)}
        </button>
        {cardActions(p)}
      </div>
    )
  }

  // Is a player eligible for a reserve area (so its empty slot should light up)?
  // Bench takes anyone; IR needs a non-active status; taxi is enforced server-side.
  const reserveEligible = (p: P, slotType: string) => {
    if (slotType === 'BN') return true
    if (['IR', 'IL', 'DL'].includes(slotType)) return !!p.status && p.status !== 'ACTIVE'
    if (slotType === 'TAXI') return true
    return false
  }
  // An OPEN reserve spot — appears/highlights while moving a starter so you can
  // drop them straight onto the bench (or taxi/IR when eligible).
  const emptyReserveCard = (slotType: string, key: string) => {
    const targetable = !!selPlayer && !isLocked(selPlayer) && STARTER(selPlayer.slot) && reserveEligible(selPlayer, slotType)
    return (
      <div key={key} className={`flex items-center border-b border-slate-50 transition ${targetable ? 'bg-blue-50 ring-1 ring-inset ring-blue-300' : selPlayer ? 'opacity-45' : ''}`}>
        <button onClick={() => { if (selPlayer && targetable) assign(selPlayer.rosterId, slotType) }} disabled={!canManage || !targetable}
          className="flex-1 min-w-0 flex items-center gap-2.5 px-2.5 py-2.5 text-left">
          <span className="w-11 flex-shrink-0 text-center text-[10px] font-bold text-slate-300">{slotType === 'BN' ? 'Bench' : slotType}</span>
          <span className="flex-1 text-xs italic text-slate-400">{targetable ? 'Tap to place here' : 'Open'}</span>
        </button>
      </div>
    )
  }
  // Open capacity per reserve area, and whether we're mid-move of a starter.
  const irKey = ['IR', 'IL', 'DL'].find(k => cfg[k]) ?? 'IR'
  const openCap = (keys: string[], used: number) => Math.max(0, keys.reduce((a, k) => a + (cfg[k] ?? 0), 0) - used)
  const movingStarter = !!selPlayer && !isLocked(selPlayer) && STARTER(selPlayer.slot)
  const reserveSection = (key: string, list: P[], type: string, open: number) => {
    const empties = movingStarter && reserveEligible(selPlayer!, type) ? open : 0
    const body = [...list.map(reserveCard), ...Array.from({ length: empties }, (_, i) => emptyReserveCard(type, `empty-${type}-${i}`))]
    return { key, count: list.length, show: body.length > 0, body }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="rounded-2xl p-5 mb-6 flex items-center gap-4 flex-wrap" style={{ background: team.primaryColor ?? '#0f172a', color: team.secondaryColor ?? '#ffffff' }}>
        {team.logo
          ? <img src={team.logo} alt="" className="w-16 h-16 object-contain bg-white/10 p-1.5" style={(team as any).logoBg ? { background: team.primaryColor } : undefined} />
          : <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-black" style={{ backgroundColor: team.secondaryColor, color: team.primaryColor }}>{team.abbreviation}</div>}
        <div className="flex-1 min-w-0">
          {team.wordmark && team.wordmark.startsWith('http')
            ? <img src={team.wordmark} alt={team.name} className="h-8 mb-1" />
            : <h1 className="text-2xl font-black">{team.wordmark || team.name}</h1>}
          <p className="text-sm opacity-80">{team.ownerName} · {players.length} players{data.isOwner ? ' · your club' : data.isCommish ? ' · commissioner control' : data.isCoManager ? ' · co-manager' : ''}</p>
          {(data.managers ?? []).length > 0 && (
            <p className="text-xs mt-0.5 opacity-60">co-managers: {(data.managers ?? []).map((m: any) => m.name ?? m.email).join(', ')}</p>
          )}
        </div>
        {team.altLogo && <img src={team.altLogo} alt="" className="w-12 h-12 object-contain bg-white/10 hidden sm:block" />}
        <div className="flex gap-2">
          {canManage && <button onClick={() => { setBrand({ name: team.name, abbreviation: team.abbreviation, logo: team.logo ?? '', altLogo: team.altLogo ?? '', wordmark: team.wordmark ?? '', primaryColor: team.primaryColor, secondaryColor: team.secondaryColor, logoBg: (team as any).logoBg ?? false }); setEditing(!editing) }} className="bg-white/15 hover:bg-white/25 text-white text-sm px-3 py-1.5 rounded-lg">Edit</button>}
          {(data.isOwner || data.isCommish) && <button onClick={() => setShowMgr(!showMgr)} className="bg-white/15 hover:bg-white/25 text-white text-sm px-3 py-1.5 rounded-lg">Co-managers</button>}
          <Link href={`/leagues/${team.leagueId}`} className="bg-white/15 hover:bg-white/25 text-white text-sm px-3 py-1.5 rounded-lg">← League</Link>
        </div>
      </div>

      {/* Branding editor */}
      {editing && (
        <div className="card p-5 mb-6 space-y-3">
          <h3 className="font-semibold text-slate-900">Club Branding</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="label">Club Name</label><input className="input" value={brand.name} onChange={e => setBrand({ ...brand, name: e.target.value })} /></div>
            <div><label className="label">Abbreviation</label><input className="input" maxLength={4} value={brand.abbreviation} onChange={e => setBrand({ ...brand, abbreviation: e.target.value })} /></div>
            <div><label className="label">Logo URL</label><input className="input" placeholder="https://…" value={brand.logo} onChange={e => setBrand({ ...brand, logo: e.target.value })} /></div>
            <div><label className="label">Alternate Logo URL</label><input className="input" placeholder="https://…" value={brand.altLogo} onChange={e => setBrand({ ...brand, altLogo: e.target.value })} /></div>
            <div><label className="label">Wordmark (text or image URL)</label><input className="input" value={brand.wordmark} onChange={e => setBrand({ ...brand, wordmark: e.target.value })} /></div>
            <div className="flex gap-4 items-end">
              <div><label className="label">Primary</label><input type="color" className="h-10 w-16 rounded border border-slate-200" value={brand.primaryColor} onChange={e => setBrand({ ...brand, primaryColor: e.target.value })} /></div>
              <div><label className="label">Secondary</label><input type="color" className="h-10 w-16 rounded border border-slate-200" value={brand.secondaryColor} onChange={e => setBrand({ ...brand, secondaryColor: e.target.value })} /></div>
              <label className="flex items-center gap-2 text-sm text-slate-600 pb-2"><input type="checkbox" checked={!!brand.logoBg} onChange={e => setBrand({ ...brand, logoBg: e.target.checked })} /> Logo on primary-color background</label>
            </div>
          </div>
          <div className="flex gap-2"><button onClick={saveBranding} className="btn-primary">Save Branding</button><button onClick={() => setEditing(false)} className="btn-secondary">Cancel</button></div>
        </div>
      )}

      {/* Co-managers editor */}
      {showMgr && (data.isOwner || data.isCommish) && (
        <div className="card p-5 mb-6 space-y-3">
          <div>
            <h3 className="font-semibold text-slate-900">Co-managers</h3>
            <p className="text-xs text-slate-500">Co-managers can set lineups and make roster moves for this club. The owner keeps full control.</p>
          </div>
          {(data.managers ?? []).length === 0
            ? <p className="text-sm text-slate-400">No co-managers yet.</p>
            : <ul className="divide-y divide-slate-50">
                {(data.managers ?? []).map((m: any) => (
                  <li key={m.userId} className="flex items-center gap-3 py-2">
                    <span className="text-sm text-slate-800">{m.name ?? m.email}</span>
                    <span className="text-xs text-slate-400">{m.email}</span>
                    <button onClick={() => removeManager(m.userId)} className="ml-auto text-[11px] text-red-500 hover:text-red-700">Remove</button>
                  </li>
                ))}
              </ul>}
          <div className="flex gap-2 items-end pt-1">
            <div className="flex-1"><label className="label">Add by email</label><input className="input" placeholder="owner@example.com" value={mgrEmail} onChange={e => setMgrEmail(e.target.value)} /></div>
            <button onClick={addManager} disabled={!mgrEmail.trim()} className="btn-primary disabled:opacity-50">Add</button>
          </div>
          {mgrErr && <p className="text-xs text-red-500">{mgrErr}</p>}
        </div>
      )}

      {/* Salary cap summary */}
      {capEnabled && (
        <div className={`card p-4 mb-5 ${overCap ? 'ring-1 ring-red-200' : ''}`}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-semibold text-slate-900">Salary Cap</span>
            <span className={`text-sm font-bold tabular-nums ${overCap ? 'text-red-600' : 'text-slate-700'}`}>
              {totalSalary.toLocaleString()}{cap > 0 ? ` / ${cap.toLocaleString()}` : ''}
            </span>
          </div>
          {cap > 0 && (
            <div className="h-2 rounded-full overflow-hidden bg-slate-100">
              <div className={overCap ? 'bg-red-500 h-full' : 'bg-emerald-500 h-full'} style={{ width: `${Math.min(100, (totalSalary / cap) * 100)}%` }} />
            </div>
          )}
          <p className="text-xs text-slate-400 mt-1">{overCap ? `Over cap by ${(totalSalary - cap).toLocaleString()}` : cap > 0 ? `${(cap - totalSalary).toLocaleString()} of cap space remaining` : 'No cap amount set'} · total across all sports</p>
        </div>
      )}

      {/* View + sport tabs */}
      <div className="flex gap-1 border-b border-slate-200 mb-5 overflow-x-auto">
        <button onClick={() => setView('roster')} className={view === 'roster' ? 'tab-active' : 'tab-inactive'}>Roster</button>
        <button onClick={() => setView('history')} className={view === 'history' ? 'tab-active' : 'tab-inactive'}>History</button>
      </div>

      {view === 'roster' && (
        <>
          <div className="flex gap-2 mb-4 flex-wrap items-center">
            {sportsPresent.map(s => (
              <button key={s} onClick={() => setSport(s)} className={`px-3 py-1.5 rounded-full text-xs font-semibold ${sport === s ? `${sportMeta(s).bg} text-white` : 'bg-slate-100 text-slate-600'}`}>
                {sportMeta(s).emoji} {abbr(s)} ({players.filter(p => p.sport === s).length})
              </button>
            ))}
            {canManage && <button onClick={() => setShowFA(!showFA)} className="ml-auto btn-secondary text-sm">{showFA ? 'Hide' : '+ Add'} Free Agents</button>}
          </div>

          {/* Daily-lineup day picker (NHL/NBA/MLB) */}
          {isDaily && weekDays.length > 0 && (
            <div className="card p-3 mb-4">
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-xs font-semibold text-slate-700">Daily lineup</span>
                <span className="text-[11px] text-slate-400">{lineupDate ? `start whoever plays ${dayLabel(lineupDate)} — a bench player can cover a slot on a day its starter is off` : 'the default lineup applied to any day you don’t customize'}</span>
              </div>
              <div className="flex gap-1.5 overflow-x-auto">
                <button onClick={() => setLineupDate(null)} className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold ${!lineupDate ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Standing</button>
                {weekDays.map(d => (
                  <button key={d} onClick={() => setLineupDate(d)} className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-center ${lineupDate === d ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    <span className="block text-xs font-semibold">{dayLabel(d)}</span>
                    <span className={`block text-[9px] ${lineupDate === d ? 'text-white/80' : 'text-slate-400'}`}>{playsOn(d)} play</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              {advisor && !dayMap && (
                <div className="card p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="font-semibold text-slate-900 flex items-center gap-2">Lineup Advisor</h2>
                    <span className="text-xs text-slate-400">projected points</span>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div><span className="text-slate-400 text-xs block">Your starters</span><span className="font-bold tabular-nums text-slate-900 text-lg">{advisor.currentTotal.toFixed(1)}</span></div>
                    <div><span className="text-slate-400 text-xs block">Optimal</span><span className="font-bold tabular-nums text-slate-900 text-lg">{advisor.optimalTotal.toFixed(1)}</span></div>
                    {advisor.gain > 0.05
                      ? <div className="ml-auto text-right"><span className="text-amber-600 text-xs block">Leaving on bench</span><span className="font-bold tabular-nums text-amber-600 text-lg">+{advisor.gain.toFixed(1)}</span></div>
                      : <div className="ml-auto text-emerald-600 text-sm font-semibold">✓ Optimal lineup set</div>}
                  </div>
                  {advisor.alerts.length > 0 && (
                    <p className="mt-3 text-xs text-red-600">Starting {advisor.alerts.map(p => `${p.name} (${p.status !== 'ACTIVE' ? p.status : 'BYE'})`).join(', ')} — projecting 0.</p>
                  )}
                  {canManage && advisor.gain > 0.05 && advisor.toStart.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {advisor.toStart.map(({ player: sIn, slot }, i) => {
                        const out = advisor.toSit[i]
                        return (
                          <div key={sIn.rosterId} className="flex items-center gap-2 text-xs">
                            <span className="text-emerald-600 font-semibold">▲ Start</span>
                            <button onClick={() => act({ action: 'SET_SLOT', rosterId: sIn.rosterId, slot })} className="font-medium text-slate-800 hover:text-blue-600 underline decoration-dotted">{sIn.name}</button>
                            <span className="text-slate-400">→ {slot}</span>
                            <span className="text-slate-400 tabular-nums">{(sIn.projectedPoints ?? 0).toFixed(1)}</span>
                            {out && <><span className="text-red-500 font-semibold ml-2">▼ Sit</span><span className="text-slate-600">{out.name}</span><span className="text-slate-400 tabular-nums">{effProj(out).toFixed(1)}</span></>}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
              {/* Tap-to-assign guidance banner while a move is in progress. */}
              {canManage && sel && (
                <div className="sticky top-14 z-20 flex items-center gap-2 rounded-lg bg-slate-900 text-white px-3 py-2 text-xs shadow-lg">
                  {selPlayer
                    ? <span className="min-w-0 truncate flex-shrink">Moving <b>{selPlayer.name}</b> — tap a slot</span>
                    : <span className="min-w-0 truncate flex-shrink">Filling <b>{selSlot?.slot}</b> — tap a player</span>}
                  <span className="ml-auto flex items-center gap-1.5 flex-shrink-0">
                    {selPlayer && reserveTargets.map(s => (
                      <button key={s} onClick={() => assign(selPlayer.rosterId, s)} className="bg-white/15 hover:bg-white/25 px-2 py-1 rounded">{reserveLabel(s)}</button>
                    ))}
                    <button onClick={() => setSel(null)} className="bg-white/10 hover:bg-white/25 px-2 py-1 rounded">Cancel</button>
                  </span>
                </div>
              )}
              {[
                { key: 'Starting Lineup', count: lineup.length, show: true, body: lineup.map((e, i) => slotCard(e, i)) },
                reserveSection('Bench', bench, 'BN', openCap(['BN'], bench.length)),
                reserveSection('Taxi Squad', taxi, 'TAXI', openCap(['TAXI'], taxi.length)),
                reserveSection('Injured Reserve', ir, irKey, openCap(['IR', 'IL', 'DL'], ir.length)),
              ].filter(s => s.show).map(section => (
                <div key={section.key} className="card overflow-hidden">
                  <div className="card-header flex items-center justify-between">
                    <h2 className="font-semibold text-slate-900">{section.key}</h2>
                    <span className="text-xs text-slate-400">{section.count} {section.count === 1 ? 'spot' : 'spots'}</span>
                  </div>
                  <div>{section.body}</div>
                </div>
              ))}
              {lineup.length === 0 && bench.length === 0 && taxi.length === 0 && ir.length === 0 && <div className="card p-8 text-center text-slate-400 text-sm">No {sport} players rostered.</div>}
            </div>

            <div className="space-y-4">
              <div className="card">
                <div className="card-header"><h2 className="font-semibold text-slate-900">Draft Picks</h2></div>
                <div className="card-body space-y-1.5 text-sm max-h-48 overflow-y-auto">
                  {picksForSport.length === 0 ? <p className="text-slate-400">No picks for {sport}.</p>
                    : picksForSport.map(pk => (
                      <div key={pk.id} className="flex items-center justify-between py-1 border-b border-slate-50">
                        <span className="font-medium text-slate-800">{pk.year} {pk.sport ? abbr(pk.sport) : 'OVERALL'}</span>
                        <span className="text-slate-500">Round {pk.round}</span>
                      </div>
                    ))}
                </div>
              </div>

              {canManage && showFA && (
                <div className="card">
                  <div className="card-header"><h2 className="font-semibold text-slate-900">{sport} Free Agents</h2></div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-50">
                    {fa.slice(0, 60).map(p => (
                      <div key={p.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                        <span className="flex-1 min-w-0">
                          <span className="font-medium text-slate-900 truncate block">{p.name}</span>
                          <span className="text-xs text-slate-400">{p.position} · {p.realTeam} · {p.seasonPoints?.toFixed(1)}</span>
                        </span>
                        <button onClick={() => act({ action: 'ADD', playerId: p.id })} className="text-xs px-2 py-1 rounded bg-green-600 text-white hover:bg-green-500">Add</button>
                      </div>
                    ))}
                    {fa.length === 0 && <p className="px-3 py-4 text-slate-400 text-sm">No free agents.</p>}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {view === 'history' && <FranchiseHistory history={history} />}

      {/* Contract editor (salary-cap leagues). */}
      {contract && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setContract(null)}>
          <div className="card p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-900">Contract</h3>
            <p className="text-sm text-slate-500 mb-4">{contract.p.name} · {contract.p.position} · {contract.p.realTeamAbbr ?? contract.p.realTeam}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Salary</label>
                <input className="input" type="number" min={0} inputMode="numeric" value={contract.salary} onChange={e => setContract({ ...contract, salary: e.target.value })} />
              </div>
              <div>
                <label className="label">Years left</label>
                <input className="input" type="number" min={0} inputMode="numeric" placeholder="none" value={contract.years} onChange={e => setContract({ ...contract, years: e.target.value })} />
              </div>
            </div>
            {capEnabled && cap > 0 && (
              <p className="text-xs text-slate-400 mt-2 tabular-nums">
                Cap space now: {(cap - totalSalary).toLocaleString()} · after change: {(cap - totalSalary + (contract.p.salary ?? 0) - (Number(contract.salary) || 0)).toLocaleString()}
              </p>
            )}
            <div className="flex gap-2 mt-4">
              <button onClick={saveContract} className="btn-primary flex-1">Save</button>
              <button onClick={() => setContract(null)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FranchiseHistory({ history }: { history: any }) {
  const [sport, setSport] = useState('NFL')
  if (!history) return <div className="text-slate-400 py-8 text-center">Loading history…</div>
  const records: any[] = history.records ?? []
  const opponents: any[] = history.opponents ?? []
  const seasons = [...new Set(records.map(r => r.season))].sort().reverse()
  const sportsPresent = SPORTS.filter(s => records.some(r => r.sport === s))

  return (
    <div className="space-y-6">
      <div className="card overflow-x-auto">
        <div className="card-header"><h2 className="font-semibold text-slate-900">Season-by-Season</h2></div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-400 border-b border-slate-100 bg-slate-50">
              <th className="text-left px-4 py-2 font-medium">Season</th>
              {sportsPresent.map(s => <th key={s} className="text-center px-3 py-2 font-medium">{sportMeta(s).emoji} {s}</th>)}
              <th className="text-center px-3 py-2 font-medium border-l border-slate-200">Fed Pts</th>
              <th className="text-center px-3 py-2 font-medium">Overall</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {seasons.map(season => {
              const fed = (history.fedBySeason ?? {})[season]
              return (
              <tr key={season} className="hover:bg-slate-50">
                <td className="px-4 py-2 text-slate-600">{season}</td>
                {sportsPresent.map(s => {
                  const r = records.find(x => x.season === season && x.sport === s)
                  return <td key={s} className="text-center px-3 py-2">{r ? <span>{r.wins}-{r.losses} <span className="text-xs text-slate-400">#{r.finishPosition}</span></span> : '—'}</td>
                })}
                <td className="text-center px-3 py-2 font-bold text-slate-900 tabular-nums border-l border-slate-200">{fed ? fed.points : '—'}</td>
                <td className="text-center px-3 py-2 tabular-nums">{fed ? <span className={fed.finish === 1 ? 'font-bold text-amber-600' : 'text-slate-600'}>#{fed.finish}<span className="text-xs text-slate-400">/{fed.of}</span></span> : '—'}</td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="card-header flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Opponents & Results</h2>
          <div className="flex gap-1.5">
            {sportsPresent.map(s => (
              <button key={s} onClick={() => setSport(s)} className={`px-2 py-1 rounded-full text-xs font-semibold ${sport === s ? `${sportMeta(s).bg} text-white` : 'bg-slate-100 text-slate-600'}`}>{sportMeta(s).emoji}</button>
            ))}
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white"><tr className="text-xs text-slate-400 border-b border-slate-100">
              <th className="text-left px-4 py-2 font-medium">Season</th><th className="text-center px-2 py-2 font-medium">Wk</th>
              <th className="text-left px-2 py-2 font-medium">Opp</th><th className="text-center px-2 py-2 font-medium">Score</th><th className="text-center px-3 py-2 font-medium">Result</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-50">
              {opponents.filter(o => o.sport === sport).sort((a, b) => (b.season ?? '').localeCompare(a.season ?? '') || b.week - a.week).slice(0, 200).map((o, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-4 py-1.5 text-slate-500">{o.season}</td>
                  <td className="px-2 py-1.5 text-center text-slate-400">{o.week}</td>
                  <td className="px-2 py-1.5 font-medium text-slate-800">{o.opponent}</td>
                  <td className="px-2 py-1.5 text-center text-slate-600">{o.my?.toFixed(1)}–{o.their?.toFixed(1)}</td>
                  <td className="px-3 py-1.5 text-center"><span className={`text-xs font-bold ${o.result === 'W' ? 'text-green-600' : o.result === 'L' ? 'text-red-500' : 'text-slate-400'}`}>{o.result}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
