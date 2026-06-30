'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { DEFAULT_ROSTER, DEFAULT_SCORING, DEFAULT_DRAFT_ROUNDS, DEFAULT_ROOKIE_ROUNDS, DEFAULT_SEASON_WEEKS, SEASON_STARTS, TRADE_DEADLINE_MODES, resolveTradeDeadlineWeek, defaultTradeDeadlines, dynastyDraftRounds, defaultWaiverSchedule, WAIVER_DAYS, buildSchedule, formatWeekRange, formatWeekRangeWithBreaks, IR_DESIGNATIONS, defaultIrDesignations, nflRosterFor, nflScoringFor, PLAYOFF_FORMATS, EVEN_TEAM_OPTIONS, LEAGUE_SIZE_OPTIONS, maxPlayoffRounds, playoffWeeks } from '@/lib/defaults'
import { groupScoring } from '@/lib/scoring-categories'
import { sportMeta, orderedSports } from '@/lib/utils'
import DuesPanel from '../DuesPanel'
import ScheduleEditor from './ScheduleEditor'

const ALL_SPORTS = ['NFL', 'NHL', 'NBA', 'MLB']
const TABS = ['General', 'Franchises', 'Sports & Schedule', 'Schedule', 'Roster', 'Scoring', 'Draft', 'Waivers', 'Trades', 'Playoffs', 'Federation']

export default function CommissionerSettings() {
  const params = useParams<{ id: string }>()
  const { data: session } = useSession()
  const [league, setLeague] = useState<any>(null)
  const [tab, setTab] = useState('General')
  const [subSport, setSubSport] = useState('NFL')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [form, setForm] = useState<any>({})
  const [sportsEnabled, setSportsEnabled] = useState<string[]>([])
  const [divisionLogos, setDivisionLogos] = useState<Record<string, string>>({})
  const [divisionLogoBg, setDivisionLogoBg] = useState<Record<string, boolean>>({})
  const [rosterObj, setRosterObj] = useState<Record<string, Record<string, number>>>({})
  const [scoringObj, setScoringObj] = useState<Record<string, Record<string, number>>>({})
  const [draftRoundsObj, setDraftRoundsObj] = useState<Record<string, number>>({})
  const [rookieRoundsObj, setRookieRoundsObj] = useState<Record<string, number>>({})
  const [seasonWeeksObj, setSeasonWeeksObj] = useState<Record<string, number>>({})
  const [startWeeksObj, setStartWeeksObj] = useState<Record<string, number>>({})
  const [deadlinesObj, setDeadlinesObj] = useState<Record<string, { mode: string; week?: number }>>({})
  const [waiverSchedObj, setWaiverSchedObj] = useState<Record<string, { day: number; hour: number }>>({})
  const [txLimits, setTxLimits] = useState<Record<string, { max: number; period: string }>>({})
  const [irDesigObj, setIrDesigObj] = useState<Record<string, string[]>>({})
  const [posLimits, setPosLimits] = useState<Record<string, Record<string, { maxStarters?: number; maxRostered?: number }>>>({})
  const [rookieDates, setRookieDates] = useState<Record<string, string>>({})
  const [sportNames, setSportNames] = useState<Record<string, string>>({})
  const [sportAbbr, setSportAbbr] = useState<Record<string, string>>({})
  const [divisionNames, setDivisionNames] = useState<Record<string, string>>({})
  const [champNames, setChampNames] = useState<Record<string, string>>({})
  const [champLogos, setChampLogos] = useState<Record<string, string>>({})
  const [champColors, setChampColors] = useState<Record<string, { p?: string; s?: string }>>({})
  const [breakWeeks, setBreakWeeks] = useState<Record<string, number[]>>({})
  const [fed, setFed] = useState<any>({ placement: [], championBonus: 3, regularSeasonBonus: 1, includedSports: [] })
  const [franchises, setFranchises] = useState<any[]>([])
  const [teamSaving, setTeamSaving] = useState<string | null>(null)
  const [teamSavedId, setTeamSavedId] = useState<string | null>(null)
  const [teamError, setTeamError] = useState<string>('')
  const [newFr, setNewFr] = useState({ name: '', abbreviation: '', ownerName: '', ownerEmail: '' })
  const [addingFr, setAddingFr] = useState(false)
  const [dynasty, setDynasty] = useState<{ id: string; status: string } | null>(null)

  const parse = (s: any, f: any) => { try { return JSON.parse(s) } catch { return f } }

  useEffect(() => {
    fetch(`/api/leagues/${params.id}`).then(r => r.json()).then(d => {
      const l = d.league
      setLeague(l)
      setForm(l)
      setFranchises((d.teams ?? []).map((t: any) => ({
        id: t.team.id,
        name: t.team.name, abbreviation: t.team.abbreviation,
        logo: t.team.logo ?? '', wordmark: t.team.wordmark ?? '',
        primaryColor: t.team.primaryColor ?? '#0f172a', secondaryColor: t.team.secondaryColor ?? '#3b82f6', logoBg: t.team.logoBg ?? false,
        ownerName: t.user?.name ?? '', ownerEmail: t.user?.email ?? '', division: t.team.division ?? null,
      })))
      const se = parse(l.sportsEnabled, ALL_SPORTS)
      setSportsEnabled(se)
      setSubSport(se[0] ?? 'NFL')
      setDivisionLogos(parse(l.divisionLogos, {}))
      setDivisionLogoBg(parse(l.divisionLogoBg, {}))
      setRosterObj(parse(l.rosterSettings, {}))
      setScoringObj(parse(l.scoringSettings, {}))
      setDraftRoundsObj(parse(l.draftRounds, {}))
      setRookieRoundsObj(parse(l.rookieDraftRounds, {}))
      setSeasonWeeksObj(parse(l.regularSeasonWeeks, {}))
      {
        const sched = parse(l.sportSchedule, []) as any[]
        const starts: Record<string, number> = {}
        const lens: Record<string, number> = parse(l.regularSeasonWeeks, {})
        for (const e of sched) {
          starts[e.sport] = e.startWeek
          if (lens[e.sport] == null && typeof e.endWeek === 'number') lens[e.sport] = e.endWeek - e.startWeek + 1
        }
        setStartWeeksObj(starts)
        setSeasonWeeksObj(lens)
      }
      setDeadlinesObj(parse(l.tradeDeadlines, defaultTradeDeadlines(se)))
      setWaiverSchedObj(parse(l.waiverSchedule, defaultWaiverSchedule(se)))
      setTxLimits(parse(l.transactionLimits, {}))
      setIrDesigObj(parse(l.irEligibleDesignations, defaultIrDesignations(se)))
      setPosLimits(parse(l.positionLimits, {}))
      setRookieDates(parse(l.rookieDraftDates, {}))
      setSportNames(parse(l.sportNames, {}))
      setSportAbbr(parse(l.sportAbbr, {}))
      setDivisionNames(parse(l.divisionNames, {}))
      setChampNames(parse(l.championshipNames, {}))
      setChampLogos(parse(l.championshipLogos, {}))
      setChampColors(parse(l.championshipColors, {}))
      setBreakWeeks(parse(l.breakWeeks, {}))
      setFed(parse(l.federationScoring, { placement: [], championBonus: 3, regularSeasonBonus: 1, includedSports: se }))
    })
    fetch(`/api/leagues/${params.id}/dynasty`).then(r => r.json()).then(d => setDynasty(d.draft ?? null))
  }, [params.id])

  if (!league) return <div className="flex items-center justify-center min-h-64 text-slate-400">Loading…</div>
  if (session?.user?.id !== league.commissionerId)
    return <div className="max-w-2xl mx-auto px-4 py-16 text-center text-slate-500">Only the commissioner can access settings.</div>

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  async function save() {
    // Divisions must be evenly sized before saving.
    const dc = form.divisions ?? 0
    if (dc > 0) {
      const counts = Array.from({ length: dc }, (_, i) => franchises.filter(f => f.division === i + 1).length)
      const balanced = counts.every(c => c === counts[0]) && franchises.length % dc === 0 && !franchises.some(f => !f.division)
      if (!balanced) { setTab('Franchises'); setTeamError('Divisions must have an equal number of teams (and every franchise assigned) before saving.'); return }
    }
    setTeamError('')
    setSaving(true)
    await fetch(`/api/leagues/${params.id}/settings`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name, abbreviation: form.abbreviation, timezone: form.timezone, description: form.description, isPublic: form.isPublic, maxTeams: form.maxTeams, season: form.season,
        duesAmount: form.duesAmount, logoUrl: form.logoUrl, seasonStart: form.seasonStart,
        primaryColor: form.primaryColor, secondaryColor: form.secondaryColor, championshipColors: champColors,
        divisions: form.divisions, divisionNames, sportNames, sportAbbr, championshipNames: champNames, championshipLogos: champLogos, breakWeeks,
        sportsEnabled, divisionLogos, divisionLogoBg, rosterSettings: rosterObj, scoringSettings: scoringObj, positionLimits: posLimits, mlbSpCap: form.mlbSpCap,
        draftRounds: draftRoundsObj, federationScoring: fed,
        draftType: form.draftType, draftOrderMethod: form.draftOrderMethod, secondsPerPick: form.secondsPerPick,
        rookieDraftMode: form.rookieDraftMode, rookieDraftRounds: rookieRoundsObj,
        tradeablePickYears: form.tradeablePickYears, draftDate: form.draftDate, rookieDraftDates: rookieDates,
        tradeReview: form.tradeReview, tradeReviewHours: form.tradeReviewHours, vetoVotesRequired: form.vetoVotesRequired, tradeDeadlines: deadlinesObj,
        waiverType: form.waiverType, faabBudget: form.faabBudget, faabMode: form.faabMode, waiverSchedule: waiverSchedObj, waiverPeriodDays: form.waiverPeriodDays, transactionLimits: txLimits, irEligibleDesignations: irDesigObj, taxiEligibility: form.taxiEligibility, lockDay: form.lockDay,
        playoffTeams: form.playoffTeams, playoffStartWeek: form.playoffStartWeek, regularSeasonWeeks: seasonWeeksObj, playoffRounds: form.playoffRounds,
        playoffFormat: form.playoffFormat, weeksPerRound: form.weeksPerRound,
        playoffReseed: form.playoffReseed, consolationBracket: form.consolationBracket, losersBracket: form.losersBracket,
        playoffTiebreaker: form.playoffTiebreaker, consolationTeams: form.consolationTeams, losersTeams: form.losersTeams,
        keeperEnabled: form.keeperEnabled, keeperCount: form.keeperCount,
        salaryCapEnabled: form.salaryCapEnabled, salaryCap: form.salaryCap, capMode: form.capMode,
        sportSchedule: buildSchedule(form.seasonStart ?? 'FOOTBALL', sportsEnabled, seasonWeeksObj, startWeeksObj),
      }),
    })
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  function setFranchise(tid: string, patch: any) {
    setFranchises(prev => prev.map(f => f.id === tid ? { ...f, ...patch } : f))
  }

  async function saveFranchise(f: any) {
    setTeamSaving(f.id); setTeamError('')
    const res = await fetch(`/api/teams/${f.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: f.name, abbreviation: f.abbreviation, logo: f.logo, wordmark: f.wordmark,
        primaryColor: f.primaryColor, secondaryColor: f.secondaryColor, logoBg: !!f.logoBg,
        ownerName: f.ownerName, ownerEmail: f.ownerEmail, division: f.division,
      }),
    })
    setTeamSaving(null)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setTeamError(typeof d.error === 'string' ? d.error : 'Could not save franchise')
      return
    }
    setTeamSavedId(f.id); setTimeout(() => setTeamSavedId(null), 2000)
  }

  async function reloadFranchises() {
    const d = await fetch(`/api/leagues/${params.id}`).then(r => r.json())
    setFranchises((d.teams ?? []).map((t: any) => ({
      id: t.team.id, name: t.team.name, abbreviation: t.team.abbreviation,
      logo: t.team.logo ?? '', wordmark: t.team.wordmark ?? '',
      primaryColor: t.team.primaryColor ?? '#0f172a', secondaryColor: t.team.secondaryColor ?? '#3b82f6', logoBg: t.team.logoBg ?? false,
      ownerName: t.user?.name ?? '', ownerEmail: t.user?.email ?? '',
    })))
  }

  async function addFranchise() {
    setAddingFr(true); setTeamError('')
    const res = await fetch(`/api/leagues/${params.id}/teams`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newFr),
    })
    setAddingFr(false)
    if (!res.ok) { const d = await res.json().catch(() => ({})); setTeamError(typeof d.error === 'string' ? d.error : 'Could not add franchise'); return }
    setNewFr({ name: '', abbreviation: '', ownerName: '', ownerEmail: '' })
    await reloadFranchises()
  }

  async function removeFranchise(f: any) {
    if (!confirm(`Remove ${f.name}? This deletes the franchise and all its roster, records, and matchups. This cannot be undone.`)) return
    setTeamError('')
    const res = await fetch(`/api/teams/${f.id}`, { method: 'DELETE' })
    if (!res.ok) { const d = await res.json().catch(() => ({})); setTeamError(typeof d.error === 'string' ? d.error : 'Could not remove franchise'); return }
    setFranchises(prev => prev.filter(x => x.id !== f.id))
  }

  function toggleSport(s: string) {
    setSportsEnabled(prev => {
      if (prev.includes(s)) return prev.filter(x => x !== s)
      // enabling: seed defaults
      setRosterObj(r => ({ ...r, [s]: r[s] ?? DEFAULT_ROSTER[s] }))
      setScoringObj(sc => ({ ...sc, [s]: sc[s] ?? DEFAULT_SCORING[s] }))
      setDraftRoundsObj(d => ({ ...d, [s]: d[s] ?? DEFAULT_DRAFT_ROUNDS[s] }))
      setRookieRoundsObj(d => ({ ...d, [s]: d[s] ?? DEFAULT_ROOKIE_ROUNDS[s] }))
      setSeasonWeeksObj(d => ({ ...d, [s]: d[s] ?? DEFAULT_SEASON_WEEKS[s] }))
      return [...prev, s]
    })
  }

  // Display order follows the league's season-start anchor.
  const orderedEnabled = orderedSports(sportsEnabled.length ? sportsEnabled : ALL_SPORTS, form.seasonStart)
  const subTabs = orderedEnabled

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-8">
        <Link href={`/leagues/${params.id}`} className="btn-ghost text-slate-500">← Back</Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Commissioner Settings</h1>
          <p className="text-sm text-slate-500">{league.name}</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {saved && <span className="text-green-600 text-sm font-medium">✓ Saved</span>}
          <button onClick={save} disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save Changes'}</button>
        </div>
      </div>

      <div className="flex gap-0 border-b border-slate-200 mb-6 overflow-x-auto">
        {TABS.map(t => <button key={t} onClick={() => setTab(t)} className={tab === t ? 'tab-active' : 'tab-inactive'}>{t}</button>)}
      </div>

      <div className="card p-6 space-y-6">
        {/* General */}
        {tab === 'General' && (
          <>
            <h3 className="font-semibold text-slate-900">General</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div><label className="label">League Name</label><input className="input" value={form.name ?? ''} onChange={e => set('name', e.target.value)} /></div>
              <div><label className="label">League Abbreviation</label><input className="input" maxLength={5} placeholder="NXS" value={form.abbreviation ?? ''} onChange={e => set('abbreviation', e.target.value)} /></div>
              <div>
                <label className="label">Timezone</label>
                <select className="select" value={form.timezone ?? 'America/New_York'} onChange={e => set('timezone', e.target.value)}>
                  {['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu', 'Europe/London', 'UTC'].map(tz => <option key={tz} value={tz}>{tz.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Season</label>
                <select className="select" value={form.season ?? '2025-26'} onChange={e => set('season', e.target.value)}>
                  {['2023-24', '2024-25', '2025-26', '2026-27', '2027-28', '2028-29'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div><label className="label">Max Teams</label><select className="select" value={form.maxTeams ?? 12} onChange={e => set('maxTeams', +e.target.value)}>{LEAGUE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n} teams</option>)}</select></div>
              <div><label className="label">Dues per franchise ($)</label><input type="number" min={0} className="input" value={form.duesAmount ?? 0} onChange={e => set('duesAmount', +e.target.value)} /></div>
              <div>
                <label className="label">Visibility</label>
                <select className="select" value={form.isPublic ? 'public' : 'private'} onChange={e => set('isPublic', e.target.value === 'public')}>
                  <option value="private">Private (invite only)</option>
                  <option value="public">Public</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="label">League Logo URL</label>
                <div className="flex items-center gap-3">
                  <input className="input flex-1" placeholder="https://…/logo.png" value={form.logoUrl ?? ''} onChange={e => set('logoUrl', e.target.value)} />
                  {form.logoUrl
                    ? <img src={form.logoUrl} alt="" className="w-12 h-12 object-contain bg-slate-100 flex-shrink-0" />
                    : <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-xl flex-shrink-0">🏆</div>}
                </div>
              </div>
              <div className="flex gap-4 items-end sm:col-span-2">
                <div><label className="label">League Primary</label><input type="color" className="h-10 w-16 rounded border border-slate-200" value={form.primaryColor ?? '#0f172a'} onChange={e => set('primaryColor', e.target.value)} /></div>
                <div><label className="label">League Secondary</label><input type="color" className="h-10 w-16 rounded border border-slate-200" value={form.secondaryColor ?? '#3b82f6'} onChange={e => set('secondaryColor', e.target.value)} /></div>
                <div className="flex-1 h-10 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{ background: `linear-gradient(135deg, ${form.primaryColor ?? '#0f172a'}, ${form.secondaryColor ?? '#3b82f6'})` }}>Brand preview</div>
              </div>
              <div className="sm:col-span-2"><label className="label">Description</label><textarea className="input h-20 resize-none" value={form.description ?? ''} onChange={e => set('description', e.target.value)} /></div>
            </div>
            <div className="pt-2">
              <h4 className="font-semibold text-slate-900 mb-2 text-sm">Dues Tracker</h4>
              <DuesPanel leagueId={params.id as string} isCommissioner />
            </div>
          </>
        )}

        {/* Schedule editor */}
        {tab === 'Schedule' && <ScheduleEditor leagueId={params.id as string} />}

        {/* Franchises */}
        {tab === 'Franchises' && (
          <>
            <h3 className="font-semibold text-slate-900">Franchises</h3>
            <p className="text-sm text-slate-500">Edit any franchise&apos;s identity, branding, and owner. Changes save per franchise.</p>
            {teamError && <p className="text-sm text-red-600">{teamError}</p>}

            {/* Divisions */}
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-center gap-3">
                <label className="label mb-0">Divisions</label>
                <select className="select w-40" value={form.divisions ?? 0} onChange={e => set('divisions', +e.target.value)}>
                  <option value={0}>No divisions</option>
                  {[2, 3, 4].map(n => <option key={n} value={n}>{n} divisions</option>)}
                </select>
                {(() => {
                  const dc = form.divisions ?? 0
                  if (!dc) return null
                  const counts = Array.from({ length: dc }, (_, i) => franchises.filter(f => f.division === i + 1).length)
                  const balanced = counts.every(c => c === counts[0]) && franchises.length % dc === 0
                  return <span className={`text-xs font-medium ${balanced ? 'text-green-600' : 'text-amber-600'}`}>
                    {counts.map((c, i) => `D${i + 1}:${c}`).join(' · ')} {balanced ? '✓ even' : '— must be even to save'}
                  </span>
                })()}
              </div>
              <p className="text-xs text-slate-500 mt-1">Assign each franchise to a division below. Divisions must have an equal number of teams before settings can be saved.</p>
              {(form.divisions ?? 0) > 0 && (
                <div className="grid sm:grid-cols-2 gap-2 mt-3">
                  {Array.from({ length: form.divisions }, (_, i) => i + 1).map(d => (
                    <div key={d} className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 w-12">Div {d}</span>
                      <input className="input text-sm" placeholder={`Division ${d} name`} value={divisionNames[d] ?? ''} onChange={e => setDivisionNames(prev => ({ ...prev, [d]: e.target.value }))} />
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-4">
              {franchises.map(f => (
                <div key={f.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-11 h-11 flex items-center justify-center text-lg font-bold flex-shrink-0 overflow-hidden"
                      style={{ background: f.primaryColor, color: f.secondaryColor }}>
                      {f.logo ? <img src={f.logo} alt="" className="w-full h-full object-contain" /> : (f.abbreviation || f.name || '?').slice(0, 4).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 truncate">{f.name || 'Unnamed franchise'}</p>
                      <p className="text-xs text-slate-400 truncate">{f.ownerName} · {f.ownerEmail}</p>
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div><label className="label">Franchise Name</label><input className="input" value={f.name} onChange={e => setFranchise(f.id, { name: e.target.value })} /></div>
                    <div><label className="label">Abbreviation</label><input className="input" maxLength={4} value={f.abbreviation} onChange={e => setFranchise(f.id, { abbreviation: e.target.value })} /></div>
                    <div className="sm:col-span-2">
                      <label className="label">Logo URL</label>
                      <input className="input" placeholder="https://…/logo.png" value={f.logo} onChange={e => setFranchise(f.id, { logo: e.target.value })} />
                    </div>
                    <div><label className="label">Wordmark URL</label><input className="input" placeholder="https://…" value={f.wordmark} onChange={e => setFranchise(f.id, { wordmark: e.target.value })} /></div>
                    <div className="flex gap-3">
                      <div>
                        <label className="label">Primary</label>
                        <input type="color" className="h-10 w-14 rounded border border-slate-200 bg-white p-0.5" value={f.primaryColor} onChange={e => setFranchise(f.id, { primaryColor: e.target.value })} />
                      </div>
                      <div>
                        <label className="label">Secondary</label>
                        <input type="color" className="h-10 w-14 rounded border border-slate-200 bg-white p-0.5" value={f.secondaryColor} onChange={e => setFranchise(f.id, { secondaryColor: e.target.value })} />
                      </div>
                      <label className="flex items-center gap-2 text-xs text-slate-600 self-end pb-2"><input type="checkbox" checked={!!f.logoBg} onChange={e => setFranchise(f.id, { logoBg: e.target.checked })} /> Logo on primary bg</label>
                    </div>
                    <div><label className="label">Owner Name</label><input className="input" value={f.ownerName} onChange={e => setFranchise(f.id, { ownerName: e.target.value })} /></div>
                    <div><label className="label">Owner Email</label><input className="input" type="email" value={f.ownerEmail} onChange={e => setFranchise(f.id, { ownerEmail: e.target.value })} /></div>
                    {(form.divisions ?? 0) > 0 && (
                      <div><label className="label">Division</label>
                        <select className="select" value={f.division ?? ''} onChange={e => setFranchise(f.id, { division: e.target.value === '' ? null : +e.target.value })}>
                          <option value="">Unassigned</option>
                          {Array.from({ length: form.divisions }, (_, i) => i + 1).map(n => <option key={n} value={n}>Division {n}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-3 mt-3">
                    <button onClick={() => removeFranchise(f)} className="text-sm text-red-500 hover:text-red-700 font-medium">Remove franchise</button>
                    <div className="flex items-center gap-3">
                      {teamSavedId === f.id && <span className="text-sm text-green-600">Saved ✓</span>}
                      <button onClick={() => saveFranchise(f)} disabled={teamSaving === f.id} className="btn-secondary text-sm disabled:opacity-50">
                        {teamSaving === f.id ? 'Saving…' : 'Save franchise'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {franchises.length === 0 && <p className="text-slate-400 text-sm py-6 text-center">No franchises yet.</p>}
            </div>

            {/* Add franchise */}
            <div className="rounded-xl border border-dashed border-slate-300 p-4">
              <p className="font-semibold text-slate-900 text-sm mb-1">Add a franchise</p>
              <p className="text-xs text-slate-500 mb-3">Creates the franchise and its owner. {franchises.length}/{form.maxTeams ?? 12} teams used.</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <div><label className="label">Franchise Name</label><input className="input" value={newFr.name} onChange={e => setNewFr(v => ({ ...v, name: e.target.value }))} placeholder="New Dynasty" /></div>
                <div><label className="label">Abbreviation</label><input className="input" maxLength={4} value={newFr.abbreviation} onChange={e => setNewFr(v => ({ ...v, abbreviation: e.target.value }))} placeholder="ND" /></div>
                <div><label className="label">Owner Name</label><input className="input" value={newFr.ownerName} onChange={e => setNewFr(v => ({ ...v, ownerName: e.target.value }))} /></div>
                <div><label className="label">Owner Email</label><input className="input" type="email" value={newFr.ownerEmail} onChange={e => setNewFr(v => ({ ...v, ownerEmail: e.target.value }))} /></div>
              </div>
              <div className="flex justify-end mt-3">
                <button onClick={addFranchise} disabled={addingFr || !newFr.name || !newFr.abbreviation || !newFr.ownerName || !newFr.ownerEmail || franchises.length >= (form.maxTeams ?? 12)}
                  className="btn-primary text-sm disabled:opacity-50">{addingFr ? 'Adding…' : 'Add franchise'}</button>
              </div>
            </div>
          </>
        )}

        {/* Sports & Schedule */}
        {tab === 'Sports & Schedule' && (
          <>
            <h3 className="font-semibold text-slate-900">Sports & Schedule</h3>
            <div>
              <label className="label">Active Sports</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {ALL_SPORTS.map(s => (
                  <button key={s} onClick={() => toggleSport(s)}
                    className={`p-3 rounded-xl border-2 text-center ${sportsEnabled.includes(s) ? 'border-blue-500 bg-blue-50' : 'border-slate-200 opacity-60'}`}>
                    <div className="text-2xl">{sportMeta(s).emoji}</div>
                    <div className="text-xs font-semibold text-slate-700">{s}</div>
                  </button>
                ))}
              </div>
            </div>
            {(() => {
              // Season-start anchors only make sense for the sports actually enabled.
              const anchorSport: Record<string, string[]> = { FOOTBALL: ['NFL'], WINTER: ['NBA', 'NHL'], BASEBALL: ['MLB'] }
              const options = SEASON_STARTS.filter(s => anchorSport[s.key].some(sp => sportsEnabled.includes(sp)))
              const opts = options.length ? options : SEASON_STARTS
              return (
                <div>
                  <label className="label">Season Start (calendar anchor)</label>
                  <select className="select" value={opts.some(o => o.key === form.seasonStart) ? form.seasonStart : opts[0].key} onChange={e => set('seasonStart', e.target.value)}>
                    {opts.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                  <p className="text-xs text-slate-400 mt-1">Sets the default order sports run; only anchors for your enabled sports are shown. Fine-tune each sport&apos;s start week below.</p>
                </div>
              )
            })()}

            {/* Editable weekly schedule */}
            <div>
              <label className="label">Weekly Schedule</label>
              <p className="text-xs text-slate-500 mb-2">Set when each sport&apos;s regular season starts and how many weeks it runs. Dates are based on the season&apos;s calendar. Playoffs begin the week after each sport&apos;s regular season ends.</p>
              <div className="space-y-2">
                {orderedEnabled.map(s => {
                  const startWk = startWeeksObj[s] || (buildSchedule(form.seasonStart ?? 'FOOTBALL', sportsEnabled, seasonWeeksObj).find(e => e.sport === s)?.startWeek ?? 1)
                  const len = seasonWeeksObj[s] ?? DEFAULT_SEASON_WEEKS[s] ?? 18
                  const endWk = startWk + len - 1
                  const meta = sportMeta(s)
                  return (
                    <div key={s} className="rounded-lg border border-slate-200 p-3">
                      <div className="flex flex-wrap items-end gap-3">
                        <span className={`inline-flex items-center gap-1.5 font-semibold w-20 ${meta.color}`}><span>{meta.emoji}</span>{s}</span>
                        <label className="text-xs text-slate-500">Start week
                          <select className="select w-24 py-1.5 mt-0.5" value={startWk}
                            onChange={e => setStartWeeksObj(d => ({ ...d, [s]: +e.target.value }))}>
                            {Array.from({ length: 40 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </label>
                        <label className="text-xs text-slate-500"># Weeks
                          <select className="select w-24 py-1.5 mt-0.5" value={len}
                            onChange={e => setSeasonWeeksObj(d => ({ ...d, [s]: +e.target.value }))}>
                            {Array.from({ length: 27 }, (_, i) => i + 4).map(n => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </label>
                      </div>
                      <div className="mt-2 text-[11px] text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5">
                        <span>Reg. season: <strong className="text-slate-700">Week {startWk}</strong> ({formatWeekRange(form.season, startWk)}) → <strong className="text-slate-700">Week {endWk}</strong> ({formatWeekRange(form.season, endWk)})</span>
                        <span className="text-slate-400">Playoffs begin Week {endWk + 1} ({formatWeekRange(form.season, endWk + 1)})</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Break weeks (all-star / Olympic pauses) */}
            <div>
              <label className="label">Break Weeks (per sport, optional)</label>
              <p className="text-xs text-slate-500 mb-2">All-star break / Winter Olympics. These are <strong>not empty byes</strong> — that week&apos;s matchup simply spans the break (a longer 2-week calendar window), and later weeks shift out. Enter week numbers separated by commas.</p>
              <div className="space-y-2">
                {orderedEnabled.map(s => {
                  const wks = (breakWeeks[s] ?? [])
                  return (
                    <div key={s} className="flex items-center gap-3">
                      <span className={`inline-flex items-center gap-1.5 w-20 font-semibold ${sportMeta(s).color}`}><span>{sportMeta(s).emoji}</span>{s}</span>
                      <input className="input flex-1 text-sm" placeholder="e.g. 18, 19"
                        value={wks.join(', ')}
                        onChange={e => setBreakWeeks(d => ({ ...d, [s]: e.target.value.split(',').map(x => parseInt(x.trim())).filter(n => Number.isFinite(n)) }))} />
                      {wks.length > 0 && <span className="text-[11px] text-slate-400 whitespace-nowrap">{wks.map(w => `Wk ${w}: ${formatWeekRangeWithBreaks(form.season, w, wks)}`).join(' · ')}</span>}
                    </div>
                  )
                })}
              </div>
            </div>

            <div>
              <label className="label">Division Logos (per sport, optional)</label>
              <p className="text-xs text-slate-500 mb-2">When a logo is set it replaces the sport emoji across the league. Check the box to sit it on the sport&apos;s primary color.</p>
              <div className="space-y-2">
                {orderedEnabled.map(s => {
                  const primary = champColors[s]?.p ?? '#0f172a'
                  return (
                    <div key={s} className="flex items-center gap-2">
                      <span className="w-12 text-sm font-medium">{sportMeta(s).emoji} {s}</span>
                      <input className="input flex-1 text-sm" placeholder="https://…" value={divisionLogos[s] ?? ''} onChange={e => setDivisionLogos(d => ({ ...d, [s]: e.target.value }))} />
                      <label className="flex items-center gap-1 text-xs text-slate-500 whitespace-nowrap cursor-pointer">
                        <input type="checkbox" checked={!!divisionLogoBg[s]} onChange={e => setDivisionLogoBg(d => ({ ...d, [s]: e.target.checked }))} />
                        Primary bg
                      </label>
                      {divisionLogos[s] && <img src={divisionLogos[s]} alt="" className="w-8 h-8 object-contain" style={{ background: divisionLogoBg[s] ? primary : '#f1f5f9' }} />}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Custom sport names + championship naming (premium) */}
            <div className="border-t border-slate-100 pt-4">
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-slate-900 text-sm">Sport &amp; Championship Naming</h4>
                <span className="text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Premium</span>
              </div>
              <p className="text-xs text-slate-500 mb-2">Rename each sport and its championship, and add a trophy/championship image.</p>
              <div className="space-y-3">
                {orderedEnabled.map(s => (
                  <div key={s} className="rounded-lg border border-slate-200 p-2.5">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-xs font-bold ${sportMeta(s).color}`}>{sportMeta(s).emoji} {s}</span>
                    </div>
                    <div className="grid sm:grid-cols-4 gap-2">
                      <input className="input text-sm" placeholder={`Sport name (${s})`} value={sportNames[s] ?? ''} onChange={e => setSportNames(d => ({ ...d, [s]: e.target.value }))} />
                      <input className="input text-sm" maxLength={5} placeholder={`Abbr (${s})`} value={sportAbbr[s] ?? ''} onChange={e => setSportAbbr(d => ({ ...d, [s]: e.target.value }))} />
                      <input className="input text-sm" placeholder="Championship name" value={champNames[s] ?? ''} onChange={e => setChampNames(d => ({ ...d, [s]: e.target.value }))} />
                      <div className="flex items-center gap-2">
                        <input className="input text-sm flex-1" placeholder="Trophy image URL" value={champLogos[s] ?? ''} onChange={e => setChampLogos(d => ({ ...d, [s]: e.target.value }))} />
                        {champLogos[s] && <img src={champLogos[s]} alt="" className="w-7 h-7 object-contain bg-slate-100" />}
                        <input type="color" title="Championship primary color" className="h-9 w-9 rounded border border-slate-200" value={champColors[s]?.p ?? '#b45309'} onChange={e => setChampColors(d => ({ ...d, [s]: { ...d[s], p: e.target.value } }))} />
                        <input type="color" title="Championship secondary color" className="h-9 w-9 rounded border border-slate-200" value={champColors[s]?.s ?? '#f59e0b'} onChange={e => setChampColors(d => ({ ...d, [s]: { ...d[s], s: e.target.value } }))} />
                      </div>
                    </div>
                  </div>
                ))}
                {/* Federation (overall) championship */}
                <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-2.5">
                  <div className="flex items-center gap-2 mb-2"><span className="text-xs font-bold text-amber-600">🏆 Federation Championship</span></div>
                  <div className="grid sm:grid-cols-2 gap-2">
                    <input className="input text-sm" placeholder={`Championship name (e.g. ${form.name ?? 'Nexus'} Cup)`} value={champNames['FED'] ?? ''} onChange={e => setChampNames(d => ({ ...d, FED: e.target.value }))} />
                    <div className="flex items-center gap-2">
                      <input className="input text-sm flex-1" placeholder="Trophy image URL" value={champLogos['FED'] ?? ''} onChange={e => setChampLogos(d => ({ ...d, FED: e.target.value }))} />
                      {champLogos['FED'] && <img src={champLogos['FED']} alt="" className="w-7 h-7 object-contain bg-slate-100" />}
                      <input type="color" title="Federation championship primary color" className="h-9 w-9 rounded border border-slate-200" value={champColors['FED']?.p ?? '#b45309'} onChange={e => setChampColors(d => ({ ...d, FED: { ...d.FED, p: e.target.value } }))} />
                      <input type="color" title="Federation championship secondary color" className="h-9 w-9 rounded border border-slate-200" value={champColors['FED']?.s ?? '#f59e0b'} onChange={e => setChampColors(d => ({ ...d, FED: { ...d.FED, s: e.target.value } }))} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Roster */}
        {tab === 'Roster' && (
          <>
            <div className="rounded-xl border border-slate-200 p-3 max-w-md">
              <p className="text-sm font-semibold text-slate-800">Taxi Squad Eligibility</p>
              <p className="text-xs text-slate-500 mb-2">Who may occupy a taxi-squad slot (applies to every sport).</p>
              <select className="select" value={form.taxiEligibility ?? 'ALL'} onChange={e => set('taxiEligibility', e.target.value)}>
                <option value="ALL">Any player</option>
                <option value="ROOKIES">Rookies only</option>
              </select>
            </div>

            <SubSportSelector subTabs={subTabs} subSport={subSport} setSubSport={setSubSport} />

            {/* NFL defense mode: team defense (DST) vs individual defenders (IDP) */}
            {subSport === 'NFL' && (
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-sm font-semibold text-slate-800">NFL Defense Format</p>
                <p className="text-xs text-slate-500 mb-2">Choose team defense (one DST per lineup) or IDP (individual defenders with their own slots & scoring). Switching updates the NFL roster slots and scoring.</p>
                <div className="flex gap-2">
                  {([['TEAM', 'Team Defense (DST)'], ['IDP', 'Individual Defenders (IDP)']] as const).map(([mode, label]) => {
                    const active = (form.defenseMode ?? 'TEAM') === mode
                    return (
                      <button key={mode} type="button"
                        onClick={() => {
                          set('defenseMode', mode)
                          setRosterObj(r => ({ ...r, NFL: nflRosterFor(mode) }))
                          setScoringObj(s => ({ ...s, NFL: nflScoringFor(mode) }))
                        }}
                        className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold border ${active ? 'bg-blue-50 border-blue-400 text-blue-700' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                        {active ? '✓ ' : ''}{label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">{subSport} Roster Positions</h3>
              <button onClick={() => setRosterObj(r => ({ ...r, [subSport]: { ...(subSport === 'NFL' ? nflRosterFor(form.defenseMode ?? 'TEAM') : DEFAULT_ROSTER[subSport]) } }))} className="btn-ghost text-xs">Reset to default</button>
            </div>
            <p className="text-xs text-slate-500">Set how many <strong>start</strong> at each position. <strong>Max starters</strong> and <strong>max rostered</strong> are optional caps (leave blank for no limit).</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                    <th className="py-1.5 pr-2">Position</th>
                    <th className="py-1.5 px-2 w-24">Starters</th>
                    <th className="py-1.5 px-2 w-28">Max Starters</th>
                    <th className="py-1.5 px-2 w-28">Max Rostered</th>
                    <th className="py-1.5 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(rosterObj[subSport] ?? {}).map(([pos, count]) => {
                    const lim = posLimits[subSport]?.[pos] ?? {}
                    const setLim = (patch: any) => setPosLimits(p => ({ ...p, [subSport]: { ...(p[subSport] ?? {}), [pos]: { ...lim, ...patch } } }))
                    return (
                      <tr key={pos} className="border-b border-slate-50">
                        <td className="py-1.5 pr-2 font-medium text-slate-700">{pos}</td>
                        <td className="py-1.5 px-2"><input type="number" min={0} max={30} value={count} onChange={e => setRosterObj(r => ({ ...r, [subSport]: { ...r[subSport], [pos]: +e.target.value } }))} className="input w-20 py-1" /></td>
                        <td className="py-1.5 px-2"><input type="number" min={0} max={30} placeholder="—" value={lim.maxStarters ?? ''} onChange={e => setLim({ maxStarters: e.target.value === '' ? undefined : +e.target.value })} className="input w-24 py-1" /></td>
                        <td className="py-1.5 px-2"><input type="number" min={0} max={40} placeholder="—" value={lim.maxRostered ?? ''} onChange={e => setLim({ maxRostered: e.target.value === '' ? undefined : +e.target.value })} className="input w-24 py-1" /></td>
                        <td className="py-1.5"><button onClick={() => setRosterObj(r => { const n = { ...r[subSport] }; delete n[pos]; return { ...r, [subSport]: n } })} className="text-red-400 hover:text-red-600">×</button></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* MLB weekly starting-pitcher cap */}
            {subSport === 'MLB' && (
              <div className="border-t border-slate-100 pt-4">
                <h4 className="font-semibold text-slate-900 text-sm">Weekly Starting-Pitcher Cap</h4>
                <p className="text-xs text-slate-500 mb-2">Limit how many starting pitchers count per team each week. Once the cap is hit, additional SP stats don&apos;t score. Set 0 for no limit.</p>
                <input type="number" min={0} max={20} className="input w-28" value={form.mlbSpCap ?? 0} onChange={e => set('mlbSpCap', +e.target.value)} />
              </div>
            )}

            {/* IR-eligible designations */}
            <div className="border-t border-slate-100 pt-4">
              <h4 className="font-semibold text-slate-900 text-sm">{subSport} IR-Eligible Designations</h4>
              <p className="text-xs text-slate-500 mb-2">Only players carrying one of these injury designations may be placed in an IR slot.</p>
              <div className="flex flex-wrap gap-2">
                {(IR_DESIGNATIONS[subSport] ?? []).map(d => {
                  const on = (irDesigObj[subSport] ?? []).includes(d)
                  return (
                    <button key={d} type="button"
                      onClick={() => setIrDesigObj(prev => {
                        const cur = prev[subSport] ?? []
                        return { ...prev, [subSport]: on ? cur.filter(x => x !== d) : [...cur, d] }
                      })}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${on ? 'bg-blue-50 border-blue-400 text-blue-700' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                      {on ? '✓ ' : ''}{d}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Salary cap */}
            <div className="border-t border-slate-100 pt-4">
              <label className="flex items-center gap-2 mb-2">
                <input type="checkbox" checked={!!form.salaryCapEnabled} onChange={e => set('salaryCapEnabled', e.target.checked)} />
                <span className="font-semibold text-slate-900">Enable salary cap</span>
              </label>
              <p className="text-xs text-slate-500 mb-2">Track player salaries and contract years for a dynasty cap. Each franchise&apos;s total salary may not exceed the cap.</p>
              {form.salaryCapEnabled && (
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label">Salary cap (total)</label>
                    <input type="number" min={0} step={1} value={form.salaryCap ?? 0} onChange={e => set('salaryCap', Math.max(0, +e.target.value))} className="input w-full text-sm" />
                  </div>
                  <div>
                    <label className="label">Cap mode</label>
                    <select className="select" value={form.capMode ?? 'SOFT'} onChange={e => set('capMode', e.target.value)}>
                      <option value="SOFT">Soft (warn over cap)</option>
                      <option value="HARD">Hard (block moves over cap)</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Scoring */}
        {tab === 'Scoring' && (
          <>
            <SubSportSelector subTabs={subTabs} subSport={subSport} setSubSport={setSubSport} />
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">{subSport} Scoring</h3>
              <button onClick={() => setScoringObj(s => ({ ...s, [subSport]: { ...DEFAULT_SCORING[subSport] } }))} className="btn-ghost text-xs">Reset to default</button>
            </div>
            <div className="space-y-5">
              {groupScoring(subSport, scoringObj[subSport] ?? {}).map(group => (
                <div key={group.group}>
                  <p className="text-xs font-bold text-slate-500 uppercase mb-2">{group.group}</p>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {group.items.map(item => (
                      <div key={item.key} className="flex items-center gap-2">
                        <span className="text-sm text-slate-600 flex-1 min-w-0 truncate">{item.label}</span>
                        <input type="number" step="0.01" value={item.value}
                          onChange={e => setScoringObj(s => ({ ...s, [subSport]: { ...s[subSport], [item.key]: +e.target.value } }))}
                          className="input w-20 text-right text-sm" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Draft */}
        {tab === 'Draft' && (
          <>
            <h3 className="font-semibold text-slate-900">Draft</h3>

            {/* Initial (dynasty) draft — locked once completed */}
            {(() => {
              const locked = dynasty?.status === 'COMPLETED'
              return (
                <div className={`rounded-xl border p-3 ${locked ? 'border-slate-200 bg-slate-50' : 'border-blue-200 bg-blue-50/40'}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-800">Initial Dynasty Draft</span>
                    {dynasty && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${locked ? 'bg-slate-200 text-slate-600' : dynasty.status === 'IN_PROGRESS' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{dynasty.status}</span>}
                    {locked && <button onClick={async () => {
                      if (!confirm('⚠️ Reset the dynasty draft?\n\nThis clears EVERY dynasty pick AND wipes every franchise\'s entire roster. This cannot be undone.')) return
                      if (!confirm('Are you absolutely sure? Type-of-no-return: all drafted rosters will be wiped and the draft reopened to PENDING.')) return
                      if (prompt('Final confirmation — type RESET to proceed.') !== 'RESET') return
                      await fetch(`/api/leagues/${params.id}/dynasty`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'RESET' }) })
                      const d = await (await fetch(`/api/leagues/${params.id}/dynasty`)).json(); setDynasty(d.draft ?? null)
                    }} className="ml-auto btn-secondary text-xs text-red-600 border-red-200">Reset draft</button>}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{locked ? 'These settings are locked because the dynasty draft is complete. Reset the draft to make changes.' : 'Configure the one-time initial draft. Settings lock automatically once it finishes.'}</p>
                </div>
              )
            })()}

            {(() => { const locked = dynasty?.status === 'COMPLETED'; return (
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Draft Type</label>
                <select className="select" disabled={locked} value={form.draftType ?? 'SNAKE'} onChange={e => set('draftType', e.target.value)}>
                  <option value="SNAKE">Snake</option><option value="AUCTION">Auction</option><option value="LINEAR">Linear</option>
                </select>
              </div>
              <div>
                <label className="label">Dynasty Draft Date</label>
                <input type="datetime-local" disabled={locked} className="input" value={form.draftDate ?? ''} onChange={e => set('draftDate', e.target.value)} />
              </div>
              <div>
                <label className="label">Rookie Draft Format</label>
                <select className="select" value={form.rookieDraftMode ?? 'PER_SPORT'} onChange={e => set('rookieDraftMode', e.target.value)}>
                  <option value="PER_SPORT">One draft per sport</option>
                  <option value="COMBINED">One combined draft</option>
                </select>
              </div>
              <div>
                <label className="label">Draft Order Method</label>
                <select className="select" disabled={locked} value={form.draftOrderMethod ?? 'REVERSE_STANDINGS'} onChange={e => set('draftOrderMethod', e.target.value)}>
                  <option value="REVERSE_STANDINGS">Reverse standings</option>
                  <option value="LOTTERY">Weighted lottery (anti-tank)</option>
                  <option value="RANDOM">Randomized</option>
                  <option value="MANUAL">Manual (commissioner sets)</option>
                </select>
              </div>
              <div>
                <label className="label">Seconds Per Pick</label>
                <input type="number" min={15} max={600} disabled={locked} className="input" value={form.secondsPerPick ?? 90} onChange={e => set('secondsPerPick', +e.target.value)} />
              </div>
              <div>
                <label className="label">Tradeable Future Pick Years</label>
                <input type="number" min={0} max={7} className="input" value={form.tradeablePickYears ?? 3} onChange={e => set('tradeablePickYears', +e.target.value)} />
              </div>
            </div>
            ) })()}

            {/* Rookie draft date(s) — per sport when drafts run per sport */}
            <div className="border-t border-slate-100 pt-4">
              <p className="text-sm font-semibold text-slate-700 mb-1">Rookie Draft {(form.rookieDraftMode ?? 'PER_SPORT') === 'PER_SPORT' ? 'Dates (per sport)' : 'Date'}</p>
              {(form.rookieDraftMode ?? 'PER_SPORT') === 'PER_SPORT' ? (
                <div className="space-y-2">
                  {orderedEnabled.map(s => (
                    <div key={s} className="flex items-center gap-3">
                      <span className={`inline-flex items-center gap-1.5 w-20 font-semibold ${sportMeta(s).color}`}><span>{sportMeta(s).emoji}</span>{s}</span>
                      <input type="datetime-local" className="input flex-1" value={rookieDates[s] ?? ''} onChange={e => setRookieDates(d => ({ ...d, [s]: e.target.value }))} />
                    </div>
                  ))}
                </div>
              ) : (
                <input type="datetime-local" className="input sm:w-72" value={rookieDates.OVERALL ?? ''} onChange={e => setRookieDates(d => ({ ...d, OVERALL: e.target.value }))} />
              )}
            </div>

            <div className="border-t border-slate-100 pt-4">
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 mb-4">
                <p className="text-sm font-semibold text-slate-700">Initial dynasty draft</p>
                <p className="text-xs text-slate-500 mt-1">
                  One combined cross-sport draft. Its length is automatically the total roster spots a franchise fills
                  (starters + bench + taxi, every sport): <span className="font-bold text-slate-800">{dynastyDraftRounds(rosterObj)} rounds</span>.
                </p>
              </div>
              <p className="text-sm font-semibold text-slate-700 mb-2">Per-sport rookie-draft rounds</p>
              <SubSportSelector subTabs={subTabs} subSport={subSport} setSubSport={setSubSport} />
              <div className="mt-3">
                <label className="label">{subSport} Rookie Rounds</label>
                <input type="number" min={1} max={20} className="input w-32" value={rookieRoundsObj[subSport] ?? 4}
                  onChange={e => setRookieRoundsObj(d => ({ ...d, [subSport]: +e.target.value }))} />
              </div>
            </div>
          </>
        )}

        {/* Waivers */}
        {tab === 'Waivers' && (
          <>
            <h3 className="font-semibold text-slate-900">Waivers</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Waiver Type</label>
                <select className="select" value={form.waiverType ?? 'PRIORITY'} onChange={e => set('waiverType', e.target.value)}>
                  <option value="PRIORITY">Waiver Priority</option><option value="FAAB">FAAB Bidding</option><option value="FREE_AGENT">Free Agent</option>
                </select>
              </div>
              {form.waiverType === 'FAAB' && <div><label className="label">FAAB Budget ($)</label><input type="number" className="input" value={form.faabBudget ?? 100} onChange={e => set('faabBudget', +e.target.value)} /></div>}
              {form.waiverType === 'FAAB' && (
                <div>
                  <label className="label">FAAB Budget Scope</label>
                  <select className="select" value={form.faabMode ?? 'TOTAL'} onChange={e => set('faabMode', e.target.value)}>
                    <option value="TOTAL">One total budget</option>
                    <option value="PER_SPORT">Separate budget per sport</option>
                  </select>
                </div>
              )}
              {form.waiverType !== 'FREE_AGENT' && (
                <div>
                  <label className="label">Waiver Period (days on waivers)</label>
                  <select className="select" value={form.waiverPeriodDays ?? 2} onChange={e => set('waiverPeriodDays', +e.target.value)}>
                    {[0, 1, 2, 3, 4, 5, 7].map(n => <option key={n} value={n}>{n === 0 ? 'None — clears immediately' : `${n} day${n > 1 ? 's' : ''}`}</option>)}
                  </select>
                  <p className="text-[11px] text-slate-400 mt-1">How long a dropped player sits on waivers before clearing to free agency.</p>
                </div>
              )}
            </div>

            {/* Per-sport waiver processing time */}
            <div>
              <label className="label">Waiver Processing Time (per sport)</label>
              <p className="text-xs text-slate-500 mb-2">Set the day and time each sport&apos;s waiver claims are processed.</p>
              <div className="space-y-2">
                {orderedEnabled.map(s => {
                  const wr = waiverSchedObj[s] ?? { day: 3, hour: 3 }
                  const meta = sportMeta(s)
                  return (
                    <div key={s} className="flex items-center gap-3 rounded-lg border border-slate-200 p-2">
                      <span className={`inline-flex items-center gap-1.5 w-20 font-semibold ${meta.color}`}><span>{meta.emoji}</span>{s}</span>
                      <select className="select flex-1" value={wr.day} onChange={e => setWaiverSchedObj(p => ({ ...p, [s]: { ...wr, day: +e.target.value } }))}>
                        {WAIVER_DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                      </select>
                      <select className="select flex-1" value={wr.hour} onChange={e => setWaiverSchedObj(p => ({ ...p, [s]: { ...wr, hour: +e.target.value } }))}>
                        {Array.from({ length: 24 }, (_, h) => (
                          <option key={h} value={h}>{h === 0 ? '12:00 AM' : h < 12 ? `${h}:00 AM` : h === 12 ? '12:00 PM' : `${h - 12}:00 PM`}</option>
                        ))}
                      </select>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Per-sport transaction limits */}
            <div className="border-t border-slate-100 pt-4">
              <label className="label">Transaction Limits (per sport)</label>
              <p className="text-xs text-slate-500 mb-2">Cap how many adds/claims a franchise can make in each sport. Leave at 0 for unlimited.</p>
              <div className="space-y-2">
                {orderedEnabled.map(s => {
                  const lim = txLimits[s] ?? { max: 0, period: 'WEEKLY' }
                  const meta = sportMeta(s)
                  return (
                    <div key={s} className="flex items-center gap-3 rounded-lg border border-slate-200 p-2">
                      <span className={`inline-flex items-center gap-1.5 w-20 font-semibold ${meta.color}`}><span>{meta.emoji}</span>{s}</span>
                      <input type="number" min={0} className="input w-24 text-sm" value={lim.max} onChange={e => setTxLimits(p => ({ ...p, [s]: { ...lim, max: Math.max(0, +e.target.value) } }))} />
                      <span className="text-xs text-slate-400">moves per</span>
                      <select className="select w-auto text-sm" value={lim.period} onChange={e => setTxLimits(p => ({ ...p, [s]: { ...lim, period: e.target.value } }))}>
                        <option value="DAILY">day</option>
                        <option value="WEEKLY">week</option>
                        <option value="SEASON">season</option>
                      </select>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}

        {/* Trades */}
        {tab === 'Trades' && (
          <>
            <h3 className="font-semibold text-slate-900">Trades</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Trade Review</label>
                <select className="select" value={form.tradeReview ?? 'COMMISSIONER'} onChange={e => set('tradeReview', e.target.value)}>
                  <option value="NONE">No review</option><option value="COMMISSIONER">Commissioner approval</option><option value="LEAGUE_VOTE">League veto vote</option>
                </select>
              </div>
              <div><label className="label">Review Period (hours)</label><input type="number" className="input" value={form.tradeReviewHours ?? 48} onChange={e => set('tradeReviewHours', +e.target.value)} /></div>
            </div>

            {/* Per-sport trade deadlines */}
            <div>
              <label className="label">Trade Deadlines (per sport)</label>
              <p className="text-xs text-slate-400 mb-2">Set when trades lock for each sport — a specific week, or relative to that sport's or the federation's championship.</p>
              <div className="space-y-2">
                {orderedEnabled.map(s => {
                  const d = deadlinesObj[s] ?? { mode: 'SPORT_PLAYOFFS' }
                  const schedule = parse(form.sportSchedule, [])
                  const resolved = resolveTradeDeadlineWeek(d as any, s, schedule, form.playoffRounds ?? 2)
                  const setD = (patch: any) => setDeadlinesObj(prev => ({ ...prev, [s]: { ...d, ...patch } }))
                  const mode = TRADE_DEADLINE_MODES.find(m => m.value === d.mode)
                  return (
                    <div key={s} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 p-2.5">
                      <span className={`text-xs font-bold px-2 py-1 rounded ${sportMeta(s).light} w-14 text-center`}>{sportMeta(s).emoji} {s}</span>
                      <select className="select flex-1 min-w-44 text-sm py-1.5" value={d.mode} onChange={e => setD({ mode: e.target.value })}>
                        {TRADE_DEADLINE_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </select>
                      {d.mode === 'WEEK' && (
                        <input type="number" min={1} className="input w-20 text-sm py-1.5" placeholder="Week" value={d.week ?? ''} onChange={e => setD({ week: +e.target.value })} />
                      )}
                      <span className="text-[11px] text-slate-400 w-full sm:w-auto sm:ml-auto">
                        {d.mode === 'NONE' ? 'No deadline' : `Locks after week ${resolved}`} · {mode?.help}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="p-4 bg-blue-50 rounded-xl text-sm text-blue-800 border border-blue-100">
              <strong>Cross-sport trades</strong> are always enabled — franchises can package players and draft picks from any sport in one deal. A deal is blocked only if <em>any</em> sport in it is past its deadline.
            </div>
          </>
        )}

        {/* Playoffs */}
        {tab === 'Playoffs' && (
          <>
            <h3 className="font-semibold text-slate-900">Playoffs</h3>
            {(() => {
              const teams = form.playoffTeams ?? 6
              const maxR = maxPlayoffRounds(teams)
              const rounds = Math.min(form.playoffRounds ?? maxR, maxR)
              const fmt = (form.playoffFormat ?? 'H2H') as any
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
                      <p className="text-[11px] text-slate-400 mt-1">{teams} teams → up to {maxR} round{maxR > 1 ? 's' : ''}.</p>
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
            <div className="border-t border-slate-100 pt-4">
              <p className="text-sm font-semibold text-slate-700">Per-sport playoff start</p>
              <p className="text-xs text-slate-500 mb-3">Each sport runs on its own calendar, so <strong>playoffs begin the week after that sport's regular season ends</strong> — they don't all start the same week. Adjust each sport's start week and length in the <strong>Sports &amp; Schedule</strong> tab.</p>
              <div className="space-y-2">
                {orderedEnabled.map(s => {
                  const startWk = startWeeksObj[s] || (buildSchedule(form.seasonStart ?? 'FOOTBALL', sportsEnabled, seasonWeeksObj).find(e => e.sport === s)?.startWeek ?? 1)
                  const len = seasonWeeksObj[s] ?? DEFAULT_SEASON_WEEKS[s] ?? 18
                  const playoffStart = startWk + len
                  return (
                    <div key={s} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-100 p-2.5">
                      <span className={`text-xs font-bold px-2 py-1 rounded w-14 text-center ${sportMeta(s).light}`}>{sportMeta(s).emoji} {s}</span>
                      <span className="text-[11px] text-slate-500">Weeks {startWk}–{startWk + len - 1}</span>
                      <span className="text-[11px] text-slate-400 sm:ml-auto"><strong className="text-slate-600">Playoffs begin week {playoffStart}</strong> ({formatWeekRange(form.season, playoffStart)})</span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4 space-y-3">
              <p className="text-sm font-semibold text-slate-700">Bracket options</p>
              <div className="max-w-xs">
                <label className="label">Seeding tiebreaker</label>
                <select className="select" value={form.playoffTiebreaker ?? 'POINTS_FOR'} onChange={e => set('playoffTiebreaker', e.target.value)}>
                  <option value="POINTS_FOR">Points For</option>
                  <option value="HEAD_TO_HEAD">Head-to-Head</option>
                  <option value="RECORD">Win % (record)</option>
                  <option value="COIN_FLIP">Coin flip (random)</option>
                </select>
                <p className="text-[11px] text-slate-400 mt-1">Breaks ties between franchises with the same number of wins when seeding the bracket.</p>
              </div>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" className="mt-0.5" checked={!!form.playoffReseed} onChange={e => set('playoffReseed', e.target.checked)} />
                <span><span className="text-sm font-medium text-slate-800">Re-seed after round 1</span><span className="block text-xs text-slate-500">Re-pair survivors by seed each round (1 plays the lowest remaining seed, 2 the next, …) instead of a fixed bracket.</span></span>
              </label>
              <div>
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input type="checkbox" className="mt-0.5" checked={!!form.consolationBracket} onChange={e => set('consolationBracket', e.target.checked)} />
                  <span><span className="text-sm font-medium text-slate-800">Consolation bracket</span><span className="block text-xs text-slate-500">Franchises that just missed the playoffs play their own bracket for a consolation title.</span></span>
                </label>
                {form.consolationBracket && (
                  <div className="mt-2 ml-7 flex items-center gap-2">
                    <label className="text-xs text-slate-500">Teams</label>
                    <select className="select w-auto text-sm" value={form.consolationTeams ?? (form.playoffTeams ?? 6)} onChange={e => set('consolationTeams', +e.target.value)}>
                      {EVEN_TEAM_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <div>
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input type="checkbox" className="mt-0.5" checked={!!form.losersBracket} onChange={e => set('losersBracket', e.target.checked)} />
                  <span><span className="text-sm font-medium text-slate-800">Losers bracket (toilet bowl)</span><span className="block text-xs text-slate-500">The bottom franchises play a bracket to settle last place.</span></span>
                </label>
                {form.losersBracket && (
                  <div className="mt-2 ml-7 flex items-center gap-2">
                    <label className="text-xs text-slate-500">Teams</label>
                    <select className="select w-auto text-sm" value={form.losersTeams ?? (form.playoffTeams ?? 6)} onChange={e => set('losersTeams', +e.target.value)}>
                      {EVEN_TEAM_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Federation */}
        {tab === 'Federation' && (
          <>
            <h3 className="font-semibold text-slate-900">Federation Scoring</h3>
            <p className="text-sm text-slate-500">Each franchise earns federation points based on where it finishes in every sport. Edit the points awarded per finishing position.</p>
            <div>
              <label className="label">Placement Points (1st → last)</label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {Array.from({ length: form.maxTeams ?? 12 }, (_, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <span className="text-xs text-slate-400 w-6">{i + 1}.</span>
                    <input type="number" className="input text-sm py-1" value={fed.placement?.[i] ?? 0}
                      onChange={e => setFed((f: any) => { const p = [...(f.placement ?? [])]; p[i] = +e.target.value; return { ...f, placement: p } })} />
                  </div>
                ))}
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div><label className="label">Champion Bonus</label><input type="number" className="input" value={fed.championBonus ?? 0} onChange={e => setFed((f: any) => ({ ...f, championBonus: +e.target.value }))} /></div>
              <div><label className="label">Regular-Season #1 Bonus</label><input type="number" className="input" value={fed.regularSeasonBonus ?? 0} onChange={e => setFed((f: any) => ({ ...f, regularSeasonBonus: +e.target.value }))} /></div>
            </div>
            <div>
              <label className="label">Sports counted toward overall standings</label>
              <div className="flex flex-wrap gap-3">
                {orderedEnabled.map(s => (
                  <label key={s} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input type="checkbox" checked={(fed.includedSports ?? []).includes(s)}
                      onChange={() => setFed((f: any) => { const inc = new Set(f.includedSports ?? []); inc.has(s) ? inc.delete(s) : inc.add(s); return { ...f, includedSports: [...inc] } })} className="w-4 h-4" />
                    {sportMeta(s).emoji} {s}
                  </label>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function SubSportSelector({ subTabs, subSport, setSubSport }: { subTabs: string[]; subSport: string; setSubSport: (s: string) => void }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {subTabs.map(s => (
        <button key={s} onClick={() => setSubSport(s)}
          className={`px-3 py-1 rounded-full text-xs font-semibold ${subSport === s ? `${sportMeta(s).bg} text-white` : 'bg-slate-100 text-slate-600'}`}>
          {sportMeta(s).emoji} {s}
        </button>
      ))}
    </div>
  )
}
