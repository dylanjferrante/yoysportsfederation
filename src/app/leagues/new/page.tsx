'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { SEASON_STARTS, buildSchedule, formatWeekRange, PLAYOFF_FORMATS, EVEN_TEAM_OPTIONS, maxPlayoffRounds, playoffWeeks } from '@/lib/defaults'
import { sportMeta } from '@/lib/utils'

const ALL_SPORTS = ['NFL', 'NBA', 'NHL', 'MLB']

export default function CreateLeaguePage() {
  const router = useRouter()
  const { data: session } = useSession()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState<any>({
    name: '', teamName: '', season: '2025-26', logoUrl: '',
    sportsEnabled: ['NFL', 'NBA', 'NHL', 'MLB'], seasonStart: 'FOOTBALL',
    maxTeams: 12, isPublic: false, description: '',
    draftType: 'SNAKE', rookieDraftMode: 'PER_SPORT', rookieDraftRounds: 4, tradeablePickYears: 3,
    waiverType: 'FAAB', faabBudget: 100, tradeReview: 'COMMISSIONER',
    playoffTeams: 6, playoffStartWeek: 15, regularSeasonWeeks: 18, playoffRounds: 3, playoffFormat: 'H2H', weeksPerRound: 2,
  })
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))
  const toggleSport = (s: string) => set('sportsEnabled', form.sportsEnabled.includes(s) ? form.sportsEnabled.filter((x: string) => x !== s) : [...form.sportsEnabled, s])

  async function submit() {
    if (!session) return
    setLoading(true); setError('')
    const res = await fetch('/api/leagues', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    setLoading(false)
    if (!res.ok) { const d = await res.json(); return setError(typeof d.error === 'string' ? d.error : 'Failed to create league') }
    const league = await res.json()
    router.push(`/leagues/${league.id}/settings`)
  }

  if (!session) return (
    <div className="max-w-xl mx-auto px-4 py-16 text-center">
      <p className="text-slate-500 mb-4">Sign in to create a league.</p>
      <Link href="/auth/login" className="btn-primary">Sign In</Link>
    </div>
  )

  const labels = ['Basics', 'League Rules', 'Playoffs', 'Review']

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Create a Federation</h1>
        <p className="text-slate-500 text-sm mt-1">You'll be the commissioner. Every owner gets one franchise across all chosen sports.</p>
      </div>

      <div className="flex items-center gap-2 mb-8">
        {[1, 2, 3, 4].map(s => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${step >= s ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-400'}`}>{s}</div>
            {s < 4 && <div className={`h-px w-6 ${step > s ? 'bg-slate-900' : 'bg-slate-200'}`} />}
          </div>
        ))}
        <span className="text-sm text-slate-500 ml-2">{labels[step - 1]}</span>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">{error}</div>}

      <div className="card p-6 space-y-5">
        {step === 1 && (
          <>
            <h2 className="font-semibold text-slate-900">Basics</h2>
            <div><label className="label">League Name</label><input className="input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Nexus Federation" /></div>
            <div><label className="label">Your Franchise Name</label><input className="input" value={form.teamName} onChange={e => set('teamName', e.target.value)} placeholder="Apex Dynasty" /></div>
            <div>
              <label className="label">Sports</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {ALL_SPORTS.map(s => (
                  <button key={s} type="button" onClick={() => toggleSport(s)}
                    className={`p-3 rounded-xl border-2 text-center ${form.sportsEnabled.includes(s) ? 'border-blue-500 bg-blue-50' : 'border-slate-200 opacity-60'}`}>
                    <div className="text-2xl">{sportMeta(s).emoji}</div><div className="text-xs font-semibold text-slate-700">{s}</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Season Start</label>
              <select className="select" value={form.seasonStart} onChange={e => set('seasonStart', e.target.value)}>
                {SEASON_STARTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>

            {/* Live schedule preview — updates with the sports & anchor chosen */}
            {form.sportsEnabled.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-600 mb-2">Season schedule preview</p>
                <div className="space-y-1.5">
                  {buildSchedule(form.seasonStart, form.sportsEnabled).map(e => (
                    <div key={e.sport} className="flex flex-wrap items-center gap-2 text-[11px]">
                      <span className={`inline-flex items-center gap-1 font-semibold w-14 ${sportMeta(e.sport).color}`}><span>{sportMeta(e.sport).emoji}</span>{e.sport}</span>
                      <span className="text-slate-600">Weeks {e.startWeek}–{e.endWeek}</span>
                      <span className="text-slate-400">{formatWeekRange(form.season, e.startWeek)} → {formatWeekRange(form.season, e.endWeek)}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 mt-2">Sports that share weeks play the same matchups. You can fine-tune each start week later in settings.</p>
              </div>
            )}
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Season</label>
                <select className="select" value={form.season} onChange={e => set('season', e.target.value)}>
                  {['2025-26', '2026-27', '2027-28', '2028-29'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Max Teams</label>
                <select className="select" value={form.maxTeams} onChange={e => set('maxTeams', +e.target.value)}>
                  {[4, 6, 8, 10, 12, 14, 16].map(n => <option key={n} value={n}>{n} teams</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="label">League Logo URL (optional)</label>
              <div className="flex gap-2 items-center">
                <input className="input flex-1" value={form.logoUrl} onChange={e => set('logoUrl', e.target.value)} placeholder="https://…/logo.png" />
                {form.logoUrl && <img src={form.logoUrl} alt="" className="w-10 h-10 rounded-lg object-cover bg-slate-100" />}
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="font-semibold text-slate-900">League Rules</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div><label className="label">Draft Type</label><select className="select" value={form.draftType} onChange={e => set('draftType', e.target.value)}><option value="SNAKE">Snake</option><option value="AUCTION">Auction</option><option value="LINEAR">Linear</option></select></div>
              <div><label className="label">Rookie Drafts</label><select className="select" value={form.rookieDraftMode} onChange={e => set('rookieDraftMode', e.target.value)}><option value="PER_SPORT">One per sport</option><option value="COMBINED">One combined</option></select></div>
              <div><label className="label">Rookie Draft Rounds</label><input type="number" min={1} max={20} className="input" value={form.rookieDraftRounds} onChange={e => set('rookieDraftRounds', +e.target.value)} /></div>
              <div><label className="label">Tradeable Pick Years</label><input type="number" min={0} max={7} className="input" value={form.tradeablePickYears} onChange={e => set('tradeablePickYears', +e.target.value)} /></div>
              <div><label className="label">Waivers</label><select className="select" value={form.waiverType} onChange={e => set('waiverType', e.target.value)}><option value="PRIORITY">Priority</option><option value="FAAB">FAAB</option><option value="FREE_AGENT">Free Agent</option></select></div>
              {form.waiverType === 'FAAB' && <div><label className="label">FAAB Budget</label><input type="number" className="input" value={form.faabBudget} onChange={e => set('faabBudget', +e.target.value)} /></div>}
              <div><label className="label">Trade Review</label><select className="select" value={form.tradeReview} onChange={e => set('tradeReview', e.target.value)}><option value="NONE">None</option><option value="COMMISSIONER">Commissioner</option><option value="LEAGUE_VOTE">League vote</option></select></div>
            </div>
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-800">✅ Federation scoring & cross-sport trading are enabled by default. Fine-tune scoring after creation.</div>
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="font-semibold text-slate-900">Playoffs</h2>
            {(() => {
              const teams = form.playoffTeams
              const maxR = maxPlayoffRounds(teams)
              const rounds = Math.min(form.playoffRounds, maxR)
              const fmt = form.playoffFormat
              const wpr = form.weeksPerRound ?? 1
              const totalWeeks = playoffWeeks(rounds, fmt, wpr)
              return (
                <>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div><label className="label">Playoff Teams (per sport)</label>
                      <select className="select" value={teams} onChange={e => { const t = +e.target.value; set('playoffTeams', t); set('playoffRounds', maxPlayoffRounds(t)) }}>
                        {EVEN_TEAM_OPTIONS.map(n => <option key={n} value={n}>{n} teams</option>)}
                      </select>
                    </div>
                    <div><label className="label">Playoff Format</label>
                      <select className="select" value={fmt} onChange={e => set('playoffFormat', e.target.value)}>
                        {PLAYOFF_FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                      </select>
                    </div>
                    <div><label className="label">Playoff Rounds</label>
                      <select className="select" value={rounds} onChange={e => set('playoffRounds', +e.target.value)}>
                        {Array.from({ length: maxR }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n} round{n > 1 ? 's' : ''}</option>)}
                      </select>
                    </div>
                    {fmt !== 'H2H' && (
                      <div><label className="label">Weeks Per {fmt === 'CHAMP_MULTI' ? 'Championship' : 'Round'}</label>
                        <select className="select" value={wpr} onChange={e => set('weeksPerRound', +e.target.value)}>
                          {[2, 3].map(n => <option key={n} value={n}>{n} weeks</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">{PLAYOFF_FORMATS.find(f => f.value === fmt)?.help} <strong className="text-slate-700">Postseason spans {totalWeeks} week{totalWeeks > 1 ? 's' : ''}.</strong></p>
                </>
              )
            })()}

            {/* Playoffs start per-sport, after each sport's own regular season — not one shared week. */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold text-slate-600 mb-1">When playoffs begin (per sport)</p>
              <p className="text-[11px] text-slate-500 mb-2">Each sport&apos;s playoffs start the week after its own regular season ends — they don&apos;t all start the same week. Fine-tune each sport&apos;s schedule in settings after creating.</p>
              <div className="space-y-1">
                {buildSchedule(form.seasonStart, form.sportsEnabled).map(e => (
                  <div key={e.sport} className="flex items-center gap-2 text-[11px]">
                    <span className={`inline-flex items-center gap-1 font-semibold w-14 ${sportMeta(e.sport).color}`}><span>{sportMeta(e.sport).emoji}</span>{e.sport}</span>
                    <span className="text-slate-600">Playoffs begin Week {e.endWeek + 1}</span>
                    <span className="text-slate-400">({formatWeekRange(form.season, e.endWeek + 1)})</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-xs text-slate-400">Per-sport season length, rookie-draft rounds, taxi/IR slots and more are configured in commissioner settings after creation.</p>
          </>
        )}

        {step === 4 && (
          <>
            <h2 className="font-semibold text-slate-900">Review & Create</h2>
            <div className="space-y-2 text-sm">
              {[
                ['League', form.name], ['Franchise', form.teamName], ['Sports', form.sportsEnabled.join(', ')],
                ['Season Start', SEASON_STARTS.find(s => s.key === form.seasonStart)?.label], ['Max Teams', form.maxTeams],
                ['Draft', form.draftType], ['Rookie Drafts', form.rookieDraftMode === 'COMBINED' ? 'Combined' : 'Per sport'],
                ['Waivers', form.waiverType], ['Trade Review', form.tradeReview], ['Playoff Teams', form.playoffTeams],
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between py-1.5 border-b border-slate-50">
                  <span className="text-slate-500">{k}</span><span className="font-medium text-slate-900">{String(v)}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400">You can customize per-sport scoring, rosters, draft rounds, and federation points in settings after creating.</p>
          </>
        )}
      </div>

      <div className="flex justify-between mt-4">
        {step > 1 ? <button onClick={() => setStep(s => s - 1)} className="btn-secondary">← Back</button> : <Link href="/leagues" className="btn-secondary">Cancel</Link>}
        {step < 4
          ? <button onClick={() => setStep(s => s + 1)} className="btn-primary" disabled={step === 1 && (!form.name || form.sportsEnabled.length === 0)}>Next →</button>
          : <button onClick={submit} disabled={loading} className="btn-primary">{loading ? 'Creating…' : 'Create Federation'}</button>}
      </div>
    </div>
  )
}
