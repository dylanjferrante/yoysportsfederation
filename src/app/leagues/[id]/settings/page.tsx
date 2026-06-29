'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { DEFAULT_ROSTER, DEFAULT_SCORING, DEFAULT_DRAFT_ROUNDS, DEFAULT_ROOKIE_ROUNDS, DEFAULT_SEASON_WEEKS, SEASON_STARTS } from '@/lib/defaults'
import { groupScoring } from '@/lib/scoring-categories'
import { sportMeta } from '@/lib/utils'

const ALL_SPORTS = ['NFL', 'NBA', 'NHL', 'MLB']
const TABS = ['General', 'Sports & Schedule', 'Roster', 'Scoring', 'Draft', 'Waivers', 'Trades', 'Playoffs', 'Federation']

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
  const [rosterObj, setRosterObj] = useState<Record<string, Record<string, number>>>({})
  const [scoringObj, setScoringObj] = useState<Record<string, Record<string, number>>>({})
  const [draftRoundsObj, setDraftRoundsObj] = useState<Record<string, number>>({})
  const [rookieRoundsObj, setRookieRoundsObj] = useState<Record<string, number>>({})
  const [seasonWeeksObj, setSeasonWeeksObj] = useState<Record<string, number>>({})
  const [fed, setFed] = useState<any>({ placement: [], championBonus: 3, regularSeasonBonus: 1, includedSports: [] })

  const parse = (s: any, f: any) => { try { return JSON.parse(s) } catch { return f } }

  useEffect(() => {
    fetch(`/api/leagues/${params.id}`).then(r => r.json()).then(d => {
      const l = d.league
      setLeague(l)
      setForm(l)
      const se = parse(l.sportsEnabled, ALL_SPORTS)
      setSportsEnabled(se)
      setSubSport(se[0] ?? 'NFL')
      setDivisionLogos(parse(l.divisionLogos, {}))
      setRosterObj(parse(l.rosterSettings, {}))
      setScoringObj(parse(l.scoringSettings, {}))
      setDraftRoundsObj(parse(l.draftRounds, {}))
      setRookieRoundsObj(parse(l.rookieDraftRounds, {}))
      setSeasonWeeksObj(parse(l.regularSeasonWeeks, {}))
      setFed(parse(l.federationScoring, { placement: [], championBonus: 3, regularSeasonBonus: 1, includedSports: se }))
    })
  }, [params.id])

  if (!league) return <div className="flex items-center justify-center min-h-64 text-slate-400">Loading…</div>
  if (session?.user?.id !== league.commissionerId)
    return <div className="max-w-2xl mx-auto px-4 py-16 text-center text-slate-500">Only the commissioner can access settings.</div>

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  async function save() {
    setSaving(true)
    await fetch(`/api/leagues/${params.id}/settings`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name, description: form.description, isPublic: form.isPublic, maxTeams: form.maxTeams, season: form.season,
        logoUrl: form.logoUrl, seasonStart: form.seasonStart,
        sportsEnabled, divisionLogos, rosterSettings: rosterObj, scoringSettings: scoringObj,
        draftRounds: draftRoundsObj, federationScoring: fed,
        draftType: form.draftType, draftOrderMethod: form.draftOrderMethod, secondsPerPick: form.secondsPerPick,
        rookieDraftMode: form.rookieDraftMode, rookieDraftRounds: rookieRoundsObj,
        tradeablePickYears: form.tradeablePickYears, draftDate: form.draftDate,
        tradeReview: form.tradeReview, tradeReviewHours: form.tradeReviewHours, vetoVotesRequired: form.vetoVotesRequired, tradeDeadline: form.tradeDeadline,
        waiverType: form.waiverType, faabBudget: form.faabBudget, faabMode: form.faabMode, waiverDay: form.waiverDay, lockDay: form.lockDay,
        playoffTeams: form.playoffTeams, playoffStartWeek: form.playoffStartWeek, regularSeasonWeeks: seasonWeeksObj, playoffRounds: form.playoffRounds,
      }),
    })
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000)
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

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const subTabs = sportsEnabled.length ? sportsEnabled : ALL_SPORTS

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
              <div>
                <label className="label">Season</label>
                <select className="select" value={form.season ?? '2025-26'} onChange={e => set('season', e.target.value)}>
                  {['2023-24', '2024-25', '2025-26', '2026-27', '2027-28', '2028-29'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div><label className="label">Max Teams</label><input type="number" min={4} max={16} className="input" value={form.maxTeams ?? 12} onChange={e => set('maxTeams', +e.target.value)} /></div>
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
                    ? <img src={form.logoUrl} alt="" className="w-12 h-12 rounded-xl object-cover bg-slate-100 flex-shrink-0" />
                    : <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-xl flex-shrink-0">🏆</div>}
                </div>
              </div>
              <div className="sm:col-span-2"><label className="label">Description</label><textarea className="input h-20 resize-none" value={form.description ?? ''} onChange={e => set('description', e.target.value)} /></div>
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
            <div>
              <label className="label">Season Start (calendar anchor)</label>
              <select className="select" value={form.seasonStart ?? 'FOOTBALL'} onChange={e => set('seasonStart', e.target.value)}>
                {SEASON_STARTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
              <p className="text-xs text-slate-400 mt-1">Determines the order sports run and which overlap each week. Overlapping sports share weekly matchups.</p>
            </div>
            <div>
              <label className="label">Division Logos (per sport, optional)</label>
              <div className="space-y-2">
                {sportsEnabled.map(s => (
                  <div key={s} className="flex items-center gap-2">
                    <span className="w-12 text-sm font-medium">{sportMeta(s).emoji} {s}</span>
                    <input className="input flex-1 text-sm" placeholder="https://…" value={divisionLogos[s] ?? ''} onChange={e => setDivisionLogos(d => ({ ...d, [s]: e.target.value }))} />
                    {divisionLogos[s] && <img src={divisionLogos[s]} alt="" className="w-8 h-8 rounded object-cover bg-slate-100" />}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Roster */}
        {tab === 'Roster' && (
          <>
            <SubSportSelector subTabs={subTabs} subSport={subSport} setSubSport={setSubSport} />
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">{subSport} Roster Positions</h3>
              <button onClick={() => setRosterObj(r => ({ ...r, [subSport]: { ...DEFAULT_ROSTER[subSport] } }))} className="btn-ghost text-xs">Reset to default</button>
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              {Object.entries(rosterObj[subSport] ?? {}).map(([pos, count]) => (
                <div key={pos} className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-700 w-20 flex-shrink-0">{pos}</span>
                  <input type="number" min={0} max={20} value={count}
                    onChange={e => setRosterObj(r => ({ ...r, [subSport]: { ...r[subSport], [pos]: +e.target.value } }))} className="input w-20" />
                  <button onClick={() => setRosterObj(r => { const n = { ...r[subSport] }; delete n[pos]; return { ...r, [subSport]: n } })} className="text-red-400 hover:text-red-600">×</button>
                </div>
              ))}
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
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Draft Type</label>
                <select className="select" value={form.draftType ?? 'SNAKE'} onChange={e => set('draftType', e.target.value)}>
                  <option value="SNAKE">Snake</option><option value="AUCTION">Auction</option><option value="LINEAR">Linear</option>
                </select>
              </div>
              <div>
                <label className="label">Dynasty Draft Date</label>
                <input type="datetime-local" className="input" value={form.draftDate ?? ''} onChange={e => set('draftDate', e.target.value)} />
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
                <select className="select" value={form.draftOrderMethod ?? 'REVERSE_STANDINGS'} onChange={e => set('draftOrderMethod', e.target.value)}>
                  <option value="REVERSE_STANDINGS">Reverse standings</option>
                  <option value="RANDOM">Randomized</option>
                  <option value="MANUAL">Manual (commissioner sets)</option>
                </select>
              </div>
              <div>
                <label className="label">Seconds Per Pick</label>
                <input type="number" min={15} max={600} className="input" value={form.secondsPerPick ?? 90} onChange={e => set('secondsPerPick', +e.target.value)} />
              </div>
              <div>
                <label className="label">Tradeable Future Pick Years</label>
                <input type="number" min={0} max={7} className="input" value={form.tradeablePickYears ?? 3} onChange={e => set('tradeablePickYears', +e.target.value)} />
              </div>
            </div>
            <div className="border-t border-slate-100 pt-4">
              <p className="text-sm font-semibold text-slate-700 mb-2">Per-sport draft rounds</p>
              <SubSportSelector subTabs={subTabs} subSport={subSport} setSubSport={setSubSport} />
              <div className="grid sm:grid-cols-2 gap-4 mt-3">
                <div>
                  <label className="label">{subSport} Dynasty (Initial) Rounds</label>
                  <input type="number" min={1} max={120} className="input w-32" value={draftRoundsObj[subSport] ?? 15}
                    onChange={e => setDraftRoundsObj(d => ({ ...d, [subSport]: +e.target.value }))} />
                </div>
                <div>
                  <label className="label">{subSport} Rookie Rounds</label>
                  <input type="number" min={1} max={20} className="input w-32" value={rookieRoundsObj[subSport] ?? 4}
                    onChange={e => setRookieRoundsObj(d => ({ ...d, [subSport]: +e.target.value }))} />
                </div>
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
              <div><label className="label">Waiver Day</label><select className="select" value={form.waiverDay ?? 3} onChange={e => set('waiverDay', +e.target.value)}>{days.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></div>
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
              <div><label className="label">Trade Deadline</label><input type="datetime-local" className="input" value={form.tradeDeadline ?? ''} onChange={e => set('tradeDeadline', e.target.value)} /></div>
            </div>
            <div className="p-4 bg-blue-50 rounded-xl text-sm text-blue-800 border border-blue-100">
              <strong>Cross-sport trades</strong> are always enabled — franchises can package players and draft picks from any sport in one deal.
            </div>
          </>
        )}

        {/* Playoffs */}
        {tab === 'Playoffs' && (
          <>
            <h3 className="font-semibold text-slate-900">Playoffs</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div><label className="label">Playoff Teams (per sport)</label><select className="select" value={form.playoffTeams ?? 4} onChange={e => set('playoffTeams', +e.target.value)}>{[2, 4, 6, 8].map(n => <option key={n} value={n}>{n} teams</option>)}</select></div>
              <div><label className="label">Playoffs Start Week</label><input type="number" min={1} max={30} className="input" value={form.playoffStartWeek ?? 15} onChange={e => set('playoffStartWeek', +e.target.value)} /></div>
              <div><label className="label">Playoff Rounds</label><select className="select" value={form.playoffRounds ?? 2} onChange={e => set('playoffRounds', +e.target.value)}><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option></select></div>
            </div>
            <div className="border-t border-slate-100 pt-4">
              <p className="text-sm font-semibold text-slate-700 mb-2">Regular-season length (weeks) per sport</p>
              <SubSportSelector subTabs={subTabs} subSport={subSport} setSubSport={setSubSport} />
              <input type="number" min={4} max={30} className="input w-32 mt-3" value={seasonWeeksObj[subSport] ?? 18}
                onChange={e => setSeasonWeeksObj(d => ({ ...d, [subSport]: +e.target.value }))} />
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
                {sportsEnabled.map(s => (
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
