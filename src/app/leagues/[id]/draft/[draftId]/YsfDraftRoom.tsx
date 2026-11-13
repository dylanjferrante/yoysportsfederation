'use client'

// The ySF Site Redesign draft room, on the Nexus draft engine:
//   state  → GET  /api/drafts/:id   (board, clock, pool, my queue)  + SSE /api/drafts/:id/stream
//   moves  → POST /api/drafts/:id   PICK · QUEUE_ADD/REMOVE/MOVE · TOGGLE_AUTOPICK · TICK
//            commissioner: START · PAUSE · RESUME · FORCE_AUTOPICK
import { useCallback, useEffect, useState } from 'react'
import { PageTitle } from '@/components/ysf/ui'
import { YSF_LEAGUES, YSF_ART, U } from '@/lib/ysf'

const btn = 'inline-flex items-center justify-center leading-none rounded font-display font-bold tracking-[.08em] text-[12px] disabled:opacity-40'
const POS = ['ALL', 'C', '1B', '2B', '3B', 'SS', 'OF', 'SP', 'RP']
const OF = ['OF', 'LF', 'CF', 'RF']

export default function YsfDraftRoom({ draftId }: { draftId: string }) {
  const [s, setS] = useState<any>(null)
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  const [pf, setPf] = useState('ALL')
  const [q, setQ] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [timerSel, setTimerSel] = useState<number | null>(null)
  const [startSel, setStartSel] = useState<string | null>(null)

  const load = useCallback(() => fetch(`/api/drafts/${draftId}`).then(r => r.json()).then(setS), [draftId])
  useEffect(() => { load() }, [load])
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  useEffect(() => {
    if (typeof window === 'undefined' || !('EventSource' in window)) { const p = setInterval(load, 4000); return () => clearInterval(p) }
    const es = new EventSource(`/api/drafts/${draftId}/stream`)
    es.addEventListener('update', () => load())
    return () => es.close()
  }, [draftId, load])

  const act = async (payload: any, ok?: string) => {
    setBusy(true)
    const r = await fetch(`/api/drafts/${draftId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    setMsg(r.ok ? (ok ?? null) : (j.error || 'That didn’t go through'))
    load()
  }
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 3000); return () => clearTimeout(t) }, [msg])

  // clock expiry → ask the server to auto-pick (it checks the deadline itself)
  const live = s?.draft?.status === 'IN_PROGRESS'
  const deadline = s?.draft?.pickDeadline ? Date.parse(s.draft.pickDeadline) : null
  const left = deadline ? Math.max(0, Math.round((deadline - now) / 1000)) : null
  useEffect(() => { if (live && left === 0) act({ action: 'TICK' }) }, [live, left === 0]) // eslint-disable-line

  if (!s) return <div className="card p-8 text-center text-ink-400">Loading the draft room…</div>
  if (s.error) return <div className="card p-8 text-center font-semibold text-ink-500">{s.error}</div>

  const d = s.draft
  const L = YSF_LEAGUES.find(l => l.sport === d.scope) ?? YSF_LEAGUES[3]
  const clubs: Record<string, any> = Object.fromEntries(s.order.map((o: any) => [o.id, o]))
  const board: any[] = s.board
  const cur = board.find(b => b.pickNumber === s.current)
  const clockTeam = live && cur ? clubs[cur.ownerId ?? cur.teamId] : null
  const mineOnClock = !!clockTeam && clockTeam.id === s.myTeamId
  const myPicks = board.filter(b => (b.ownerId ?? b.teamId) === s.myTeamId)
  const nextMine = myPicks.find(b => !b.player && b.pickNumber >= Math.max(1, s.current))
  const away = nextMine ? board.filter(b => !b.player && b.pickNumber < nextMine.pickNumber && b.pickNumber >= Math.max(1, s.current)).length : 0
  const label = (b: any) => `${b.round}.${String(b.pickInRound).padStart(2, '0')}`
  const dur = (secs: number) => secs < 60 ? `${secs} sec` : secs < 3600 ? `${Math.round(secs / 60)} min` : secs % 3600 ? `${(secs / 3600).toFixed(1)} hr` : `${secs / 3600} hr`
  const clockTxt = (secs: number) => secs >= 3600 ? `${Math.floor(secs / 3600)}:${String(Math.floor(secs / 60) % 60).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}` : `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
  const TIMERS = [30, 60, 90, 120, 180, 300, 600, 900, 1800, 3600, 7200, 14400, 28800, 86400]
  const pickSecs = d.pickSeconds ?? 90
  const localInput = (iso: string | null) => { if (!iso) return ''; const t = new Date(iso); const z = (n: number) => String(n).padStart(2, '0'); return `${t.getFullYear()}-${z(t.getMonth() + 1)}-${z(t.getDate())}T${z(t.getHours())}:${z(t.getMinutes())}` }
  const starts = d.startsAt ? new Date(d.startsAt) : null
  const startsTxt = starts ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(starts) + ' ET' : ''
  const until = starts ? Math.max(0, starts.getTime() - now) : 0
  const dhm = `${Math.floor(until / 86400000)}d ${Math.floor(until / 3600000) % 24}h ${Math.floor(until / 60000) % 60}m`
  const queueIds = new Set(s.myQueue.map((x: any) => x.playerId))
  const meta = (p: any) => `(${L.code}-${p.realTeamAbbr || p.prospect?.org || 'FA'}, ${(p.position ?? '').replace(/,/g, '/')})`
  const isMlb = L.sport === 'MLB'
  const avail = s.available.filter((p: any) => (pf === 'ALL' || p.position === pf || (pf === 'OF' && OF.includes(p.position))) && (!q || p.name.toLowerCase().includes(q.toLowerCase())))
  const rounds = Math.max(...board.map(b => b.round))
  const perRound = Math.max(...board.map(b => b.pickInRound))

  return (
    <>
      <PageTitle eyebrow={`${L.code} · ${d.season.replace('-', '–')} ${d.kind === 'ROOKIE' ? 'rookie draft' : 'draft'}`} title="DRAFT ROOM" right={
        <div className="flex items-center gap-3"><div className="text-right ui text-[12px] text-ink-500 leading-relaxed">{U(startsTxt)}<br />{rounds} ROUNDS · {d.type === 'LINEAR' ? 'NON-SNAKE' : d.type} · {dur(pickSecs).toUpperCase()} PER PICK</div>
          <img src={YSF_ART.leagueSymbol(L.key, 'white')} alt={L.code} className="w-14 h-14 object-contain" /></div>} />

      <section className="grid grid-cols-1 sm:grid-cols-2 rounded overflow-hidden text-white">
        <div className="flex items-center gap-4 px-5 py-4" style={{ background: clockTeam?.primaryColor ?? L.color }}>
          {clockTeam ? <>
            <span className="w-16 h-16 inline-flex items-center justify-center flex-none"><img src={clockTeam.altLogo || clockTeam.logo} alt="" className="w-16 h-16 object-contain" /></span>
            <div className="min-w-0"><div className="ui text-[12px] opacity-90">ON THE CLOCK · PICK {label(cur)} ({cur.pickNumber} OVERALL)</div>
              <div className="disp text-[34px] font-extrabold leading-[.95]">{clockTeam.name}</div>
              {cur.via && <div className="text-[13px] opacity-90 mt-1">via {cur.teamAbbr}</div>}</div>
            <div className="ml-auto disp text-[40px] font-extrabold tabular-nums">{left != null ? clockTxt(left) : ''}</div>
          </> : d.status === 'COMPLETED' ? <div className="disp text-[30px] font-extrabold">DRAFT COMPLETE</div>
            : <div><div className="ui text-[12px] opacity-90">{d.status === 'PAUSED' ? 'PAUSED' : 'DRAFT STARTS IN'}</div><div className="disp text-[40px] font-extrabold leading-none tabular-nums">{d.status === 'PAUSED' ? '—' : dhm}</div></div>}
        </div>
        <div className="bg-black flex flex-col justify-center gap-2.5 px-5 py-4">
          <div className="ui text-[12px] text-ink-200">{mineOnClock ? 'YOU’RE ON THE CLOCK' : nextMine ? 'YOUR NEXT PICK' : 'YOUR PICKS'}</div>
          <div className="disp text-[26px] font-extrabold leading-none">{mineOnClock ? `PICK ${label(cur)}` : nextMine ? `${label(nextMine)}${live ? ` · ${away} ${away === 1 ? 'PICK' : 'PICKS'} AWAY` : ''}` : s.myTeamId ? 'ALL USED' : '—'}</div>
          <div className="flex flex-wrap gap-2">
            {s.myTeamId && <button disabled={busy} onClick={() => act({ action: 'TOGGLE_AUTOPICK' }, s.myAutopick ? 'Auto-pick off' : 'Auto-pick on: your queue first, then the best available')} className={`${btn} h-10 px-3.5 border border-white`} style={{ background: s.myAutopick ? '#fff' : 'transparent', color: s.myAutopick ? '#000' : '#fff' }}>AUTO-PICK {s.myAutopick ? 'ON' : 'OFF'}</button>}
            {mineOnClock && <button disabled={busy} onClick={() => act({ action: 'AUTO_PICK' })} className={`${btn} h-10 px-3.5 border border-white text-white`}>PICK FROM QUEUE</button>}
            {s.isCommish && <button onClick={() => { setShowSettings(!showSettings); setTimerSel(pickSecs); setStartSel(localInput(d.startsAt)) }} className={`${btn} h-10 px-3.5 border border-white`} style={{ background: showSettings ? '#fff' : 'transparent', color: showSettings ? '#000' : '#fff' }}>DRAFT SETTINGS</button>}
            {s.isCommish && d.status === 'PENDING' && <button disabled={busy} onClick={() => act({ action: 'START' }, 'Draft started')} className={`${btn} h-10 px-3.5 bg-white text-black`}>START DRAFT</button>}
            {s.isCommish && live && <button disabled={busy} onClick={() => act({ action: 'PAUSE' })} className={`${btn} h-10 px-3.5 border border-ink-500 text-ink-200`}>PAUSE</button>}
            {s.isCommish && d.status === 'PAUSED' && <button disabled={busy} onClick={() => act({ action: 'RESUME' })} className={`${btn} h-10 px-3.5 bg-white text-black`}>RESUME</button>}
            {s.isCommish && live && !mineOnClock && <button disabled={busy} onClick={() => act({ action: 'FORCE_AUTOPICK' })} className={`${btn} h-10 px-3.5 border border-ink-500 text-ink-200`}>AUTO-PICK FOR {clockTeam?.abbreviation}</button>}
          </div>
        </div>
      </section>

      {s.isCommish && showSettings && (
        <section className="card p-4 sm:p-5 flex flex-col gap-4" style={{ borderTop: '4px solid #000' }}>
          <div className="ui text-[12px] font-bold tracking-[.12em]">DRAFT SETTINGS · COMMISSIONER</div>
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
            <div className="flex flex-col gap-2">
              <span className="ui text-[11px] text-ink-500">PICK TIMER</span>
              <div className="flex flex-wrap gap-1">{TIMERS.map(t => (
                <button key={t} onClick={() => setTimerSel(t)} className={`${btn} h-9 px-2.5 border`} style={{ borderColor: timerSel === t ? '#000' : '#C7C7C7', background: timerSel === t ? '#000' : '#fff', color: timerSel === t ? '#fff' : '#000' }}>{dur(t).toUpperCase()}</button>))}</div>
              <label className="flex items-center gap-2 text-[13px] text-ink-500">Custom <input type="number" min={1} value={timerSel ? Math.round(timerSel / 60) : ''} onChange={e => setTimerSel(Math.max(1, Math.round(+e.target.value || 0)) * 60)} className="w-20 h-9 px-2 border border-black rounded font-bold text-black" /> minutes</label>
              <button disabled={busy || !timerSel || timerSel === pickSecs} onClick={() => act({ action: 'SETTINGS', pickSeconds: timerSel }, `Pick timer set to ${dur(timerSel!)}${live ? ' (current pick restarted)' : ''}`)} className={`${btn} h-10 px-4 bg-black text-white self-start`}>SAVE TIMER</button>
            </div>
            <div className="flex flex-col gap-2">
              <span className="ui text-[11px] text-ink-500">START TIME</span>
              <input type="datetime-local" disabled={d.status !== 'PENDING'} value={startSel ?? ''} onChange={e => setStartSel(e.target.value)} className="h-11 px-3 border border-black rounded font-semibold disabled:opacity-50" />
              <span className="text-[13px] text-ink-500">{d.status === 'PENDING' ? `Currently ${startsTxt}` : 'Locked once the draft starts'}</span>
              <button disabled={busy || d.status !== 'PENDING' || !startSel || startSel === localInput(d.startsAt)} onClick={() => act({ action: 'SETTINGS', startsAt: new Date(startSel!).toISOString() }, 'Start time updated')} className={`${btn} h-10 px-4 bg-black text-white self-start`}>SAVE START TIME</button>
            </div>
            <div className="flex flex-col gap-2">
              <span className="ui text-[11px] text-ink-500">LIVE CLOCK</span>
              <div className="flex flex-wrap gap-1.5">
                <button disabled={busy || !live} onClick={() => act({ action: 'RESET_CLOCK' }, 'Clock reset')} className={`${btn} h-10 px-3 border border-black bg-white text-black`}>RESET CLOCK</button>
                <button disabled={busy || !live} onClick={() => act({ action: 'ADD_TIME', addSeconds: 60 }, 'Added 1 minute')} className={`${btn} h-10 px-3 border border-black bg-white text-black`}>+1 MIN</button>
                <button disabled={busy || !live} onClick={() => act({ action: 'ADD_TIME', addSeconds: 300 }, 'Added 5 minutes')} className={`${btn} h-10 px-3 border border-black bg-white text-black`}>+5 MIN</button>
                {live && <button disabled={busy} onClick={() => act({ action: 'PAUSE' }, 'Draft paused')} className={`${btn} h-10 px-3 border border-black bg-white text-black`}>PAUSE DRAFT</button>}
                {d.status === 'PAUSED' && <button disabled={busy} onClick={() => act({ action: 'RESUME' }, 'Draft resumed')} className={`${btn} h-10 px-3 bg-black text-white`}>RESUME DRAFT</button>}
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="disp text-[28px] font-extrabold m-0">DRAFT BOARD</h2>
        <div className="overflow-x-auto">
          <div className="grid gap-1 min-w-[1240px]" style={{ gridTemplateColumns: `44px repeat(${perRound}, minmax(96px, 1fr))` }}>
            <span />
            {Array.from({ length: perRound }, (_, i) => <span key={i} className="ui text-[12px] text-ink-500 text-center py-1">PICK {i + 1}</span>)}
            {Array.from({ length: rounds }, (_, r) => [
              <span key={'r' + r} className="ui inline-flex items-center justify-center text-[12px] font-bold bg-black text-white rounded-[3px]">R{r + 1}</span>,
              ...board.filter(b => b.round === r + 1).sort((a, b) => a.pickInRound - b.pickInRound).map(b => {
                const owner = clubs[b.ownerId ?? b.teamId], now_ = live && b.pickNumber === s.current, mine = (b.ownerId ?? b.teamId) === s.myTeamId
                return (
                  <div key={b.pickNumber} className="min-h-[86px] p-2 rounded flex flex-col gap-1" style={{ background: b.player ? owner?.primaryColor : '#fff', color: b.player ? '#fff' : '#000',
                    border: now_ ? '3px solid #000' : mine ? `2px solid ${owner?.primaryColor}` : '1px solid #E5E5E5' }}>
                    <div className="flex items-center gap-1.5"><span className="w-[22px] h-[22px] inline-flex items-center justify-center flex-none"><img src={b.player ? owner?.altLogo || owner?.logo : owner?.logo} alt="" className="w-[22px] h-[22px] object-contain" /></span>
                      <span className="ui text-[11px] font-bold">{owner?.abbreviation}</span></div>
                    <span className="text-[13px] font-bold leading-tight">{b.player ? b.player.name : now_ ? 'ON THE CLOCK' : ''}</span>
                    <span className="text-[11px] opacity-85 leading-tight">{b.player ? `${L.code}-${b.player.realTeamAbbr ?? ''}, ${b.player.position}` : b.via ? `via ${b.teamAbbr}` : ''}</span>
                  </div>
                )
              }),
            ])}
          </div>
        </div>
      </section>

      <section className="flex flex-wrap gap-5 items-start">
        <div className="flex flex-col gap-3 flex-[2_1_560px] min-w-0">
          <div className="flex flex-wrap justify-between items-center gap-2.5">
            <h2 className="disp text-[28px] font-extrabold m-0">AVAILABLE</h2>
            <div className="flex flex-wrap gap-1">{POS.map(f => <button key={f} onClick={() => setPf(f)} className={`${btn} h-[34px] min-w-[40px] px-2.5 border`} style={{ borderColor: f === pf ? '#000' : '#C7C7C7', background: f === pf ? '#000' : '#fff', color: f === pf ? '#fff' : '#000' }}>{f}</button>)}</div>
          </div>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search players" className="h-11 px-3.5 border border-black rounded-lg font-semibold" />
          <div className="card overflow-hidden">
            {/* baseball: sorted by the ySF prospect score, with each player's level, age and season line */}
            <div className="ui grid grid-cols-[52px_minmax(0,1fr)_auto] gap-3 px-4 py-2.5 border-b-2 border-black text-[12px] text-ink-500 tracking-[.12em]"><span title={isMlb ? 'ySF prospect score: level, age for the level, and production (50 = an average High-A regular)' : undefined}>{isMlb ? 'SCORE' : 'MLB #'}</span><span>PLAYER</span><span /></div>
            {avail.map((p: any) => (
              <div key={p.id} className="grid grid-cols-[52px_minmax(0,1fr)_auto] gap-3 items-center px-4 py-2 border-t border-ink-50">
                <span className="font-bold text-ink-500 tabular-nums">{isMlb ? (p.prospect ? Math.round(p.prospect.score) : '—') : p.adp ?? '—'}</span>
                <span className="min-w-0 font-bold">{p.name}<span className="block font-normal text-[13px] text-ink-500 ysf-case">{meta(p)}</span>
                  {isMlb && p.prospect && <span className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 mt-0.5 font-normal text-[12px] text-ink-800">
                    <span className="ui inline-flex items-center leading-none h-[18px] px-1.5 rounded-[2px] bg-black text-white text-[10px] font-bold">{p.prospect.level}</span>
                    {p.prospect.age != null && <span>Age {p.prospect.age}</span>}
                    {Object.entries(p.prospect.line).map(([k, v]) => <span key={k} className="whitespace-nowrap"><span className="text-ink-500">{k === 'K9' ? 'K/9' : k}</span> {String(v)}</span>)}
                  </span>}
                  {isMlb && !p.prospect && <span className="block font-normal text-[12px] text-ink-400">No 2026 pro stats</span>}
                </span>
                <span className="flex gap-1.5">
                  {s.myTeamId && <button disabled={busy} onClick={() => act({ action: queueIds.has(p.id) ? 'QUEUE_REMOVE' : 'QUEUE_ADD', playerId: p.id })} className={`${btn} h-8 min-w-[84px] px-2.5 border border-black`}
                    style={{ background: queueIds.has(p.id) ? '#000' : '#fff', color: queueIds.has(p.id) ? '#fff' : '#000' }}>{queueIds.has(p.id) ? 'QUEUED' : '+ QUEUE'}</button>}
                  {(mineOnClock || (s.isCommish && live)) && <button disabled={busy} onClick={() => act({ action: 'PICK', playerId: p.id }, `Drafted ${p.name}`)} className={`${btn} h-8 px-3 text-white`} style={{ background: clockTeam?.primaryColor ?? '#000' }}>DRAFT</button>}
                </span>
              </div>
            ))}
            {!avail.length && <div className="p-4 text-ink-400 font-semibold">No players left at this position</div>}
          </div>
        </div>
        <div className="flex flex-col gap-5 flex-[1_1_300px] min-w-0">
          <div className="card overflow-hidden" style={{ borderTop: '4px solid #000' }}>
            <div className="ui flex justify-between px-4 py-2.5 bg-ink-50 text-[12px] font-bold tracking-[.12em]"><span>MY QUEUE</span><span className="text-ink-500">{s.myQueue.length}</span></div>
            {s.myQueue.map((x: any, i: number) => (
              <div key={x.playerId} className="grid grid-cols-[22px_minmax(0,1fr)_auto] gap-2.5 items-center px-4 py-2 border-t border-ink-50">
                <span className="font-bold text-ink-500">{i + 1}</span><span className="font-bold min-w-0 truncate">{x.name}</span>
                <span className="flex gap-1">
                  {(['up', 'down'] as const).map(dir => <button key={dir} disabled={busy} onClick={() => act({ action: 'QUEUE_MOVE', playerId: x.playerId, direction: dir })} aria-label={`Move ${dir}`} className={`${btn} w-[30px] h-[30px] border border-ink-200 bg-white text-black text-[13px]`}>{dir === 'up' ? '▲' : '▼'}</button>)}
                  <button disabled={busy} onClick={() => act({ action: 'QUEUE_REMOVE', playerId: x.playerId })} aria-label="Remove" className={`${btn} w-[30px] h-[30px] border border-ink-200 bg-white text-ink-500 text-[13px]`}>✕</button>
                </span>
              </div>
            ))}
            {!s.myQueue.length && <div className="px-4 py-3.5 text-ink-400 font-semibold">Queue is empty</div>}
          </div>
          <div className="card overflow-hidden" style={{ borderTop: `4px solid ${clubs[s.myTeamId]?.primaryColor ?? '#000'}` }}>
            <div className="ui flex justify-between px-4 py-2.5 bg-ink-50 text-[12px] font-bold tracking-[.12em]"><span>MY PICKS</span><span className="text-ink-500">{myPicks.length}</span></div>
            {myPicks.map(b => (
              <div key={b.pickNumber} className="grid grid-cols-[52px_minmax(0,1fr)] gap-2.5 items-center px-4 py-2 border-t border-ink-50">
                <span className="ui inline-flex items-center justify-center leading-none h-[26px] rounded-[3px] text-[12px] font-bold text-white" style={{ background: live && b.pickNumber === s.current ? '#000' : clubs[s.myTeamId]?.primaryColor }}>{label(b)}</span>
                <span className="min-w-0"><span className="font-bold">{b.player ? b.player.name : live && b.pickNumber === s.current ? 'On the clock' : `Pick ${b.pickNumber} overall`}</span>
                  {(b.player || b.via) && <span className="block text-[12px] text-ink-500">{b.player ? `${L.code}-${b.player.realTeamAbbr ?? ''}, ${b.player.position}` : `via ${b.teamAbbr}`}</span>}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
      {msg && <div className="fixed left-1/2 -translate-x-1/2 bottom-[76px] z-50 bg-black text-white px-4 py-3 rounded font-semibold shadow-lg">{msg}</div>}
    </>
  )
}
