'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { DEFAULT_ROSTER, DEFAULT_SCORING } from '@/lib/defaults'

type League = {
  id: string; name: string; sport: string; season: string; status: string
  commissionerId: string; maxTeams: number; description: string | null; isPublic: boolean
  rosterSettings: string; scoringSettings: string
  draftType: string; draftDate: string | null; auctionBudget: number; secondsPerPick: number; autoPickEnabled: boolean
  tradeDeadline: string | null; tradeReview: string; tradeReviewHours: number; vetoVotesRequired: number
  waiverType: string; faabBudget: number; waiverDay: number; lockDay: number
  playoffTeams: number; playoffStartWeek: number; regularSeasonWeeks: number; playoffRounds: number
  inviteCode: string | null
}

const TABS = ['General', 'Roster', 'Scoring', 'Draft', 'Waivers', 'Trades', 'Playoffs']

export default function CommissionerSettings() {
  const params = useParams()
  const router = useRouter()
  const { data: session } = useSession()
  const [league, setLeague] = useState<League | null>(null)
  const [tab, setTab] = useState('General')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [form, setForm] = useState<Partial<League>>({})
  const [rosterObj, setRosterObj] = useState<Record<string, number>>({})
  const [scoringObj, setScoringObj] = useState<Record<string, number>>({})

  useEffect(() => {
    fetch(`/api/leagues/${params.id}`)
      .then(r => r.json())
      .then(data => {
        const l: League = data.league
        setLeague(l)
        setForm(l)
        setRosterObj(JSON.parse(l.rosterSettings ?? '{}'))
        setScoringObj(JSON.parse(l.scoringSettings ?? '{}'))
      })
  }, [params.id])

  if (!league) return <div className="flex items-center justify-center min-h-64"><div className="text-slate-400">Loading…</div></div>
  if (session?.user?.id !== league.commissionerId) {
    return <div className="max-w-2xl mx-auto px-4 py-16 text-center text-slate-500">Only the commissioner can access settings.</div>
  }

  async function save() {
    setSaving(true)
    const payload = { ...form, rosterSettings: rosterObj, scoringSettings: scoringObj }
    await fetch(`/api/leagues/${params.id}/settings`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function set(key: keyof League, value: unknown) {
    setForm(f => ({ ...f, [key]: value }))
  }

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

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
          <button onClick={save} disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-slate-200 mb-6 overflow-x-auto">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={tab === t ? 'tab-active' : 'tab-inactive'}>
            {t}
          </button>
        ))}
      </div>

      <div className="card p-6 space-y-6">

        {/* ── General ── */}
        {tab === 'General' && (
          <>
            <h3 className="font-semibold text-slate-900 text-base">General Settings</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label">League Name</label>
                <input className="input" value={form.name ?? ''} onChange={e => set('name', e.target.value)} />
              </div>
              <div>
                <label className="label">Season</label>
                <input className="input" value={form.season ?? ''} onChange={e => set('season', e.target.value)} />
              </div>
              <div>
                <label className="label">Max Teams</label>
                <input type="number" className="input" min={4} max={32} value={form.maxTeams ?? 12} onChange={e => set('maxTeams', +e.target.value)} />
              </div>
              <div>
                <label className="label">Visibility</label>
                <select className="select" value={form.isPublic ? 'public' : 'private'} onChange={e => set('isPublic', e.target.value === 'public')}>
                  <option value="private">Private (invite only)</option>
                  <option value="public">Public (anyone can join)</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="label">Description</label>
                <textarea className="input h-20 resize-none" value={form.description ?? ''} onChange={e => set('description', e.target.value)} placeholder="Optional league description" />
              </div>
              {league.inviteCode && (
                <div className="sm:col-span-2 p-4 bg-slate-50 rounded-xl">
                  <p className="text-xs text-slate-500 mb-1">Invite Code — share this with players to join</p>
                  <code className="text-lg font-mono font-bold tracking-widest text-slate-900">{league.inviteCode}</code>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Roster ── */}
        {tab === 'Roster' && (
          <>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-900 text-base">Roster Positions</h3>
              <button onClick={() => setRosterObj(DEFAULT_ROSTER[league.sport] ?? {})} className="btn-ghost text-xs">Reset to default</button>
            </div>
            <p className="text-sm text-slate-500">Set how many of each position slot each team has. BN = bench spots, IR = injured reserve.</p>
            <div className="grid sm:grid-cols-3 gap-3">
              {Object.entries(rosterObj).map(([pos, count]) => (
                <div key={pos} className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-700 w-20 flex-shrink-0">{pos}</span>
                  <input type="number" min={0} max={20} value={count}
                    onChange={e => setRosterObj(r => ({ ...r, [pos]: +e.target.value }))}
                    className="input w-20" />
                  <button onClick={() => setRosterObj(r => { const n={...r}; delete n[pos]; return n })}
                    className="text-red-400 hover:text-red-600 text-lg flex-shrink-0">×</button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 pt-2">
              <input id="new-pos" className="input w-28" placeholder="QB" />
              <button onClick={() => {
                const inp = document.getElementById('new-pos') as HTMLInputElement
                if (inp.value) { setRosterObj(r => ({ ...r, [inp.value.toUpperCase()]: 1 })); inp.value = '' }
              }} className="btn-secondary text-sm">Add Slot</button>
            </div>
          </>
        )}

        {/* ── Scoring ── */}
        {tab === 'Scoring' && (
          <>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-900 text-base">Scoring Settings</h3>
              <button onClick={() => setScoringObj(DEFAULT_SCORING[league.sport] ?? {})} className="btn-ghost text-xs">Reset to default</button>
            </div>
            <p className="text-sm text-slate-500">Points awarded per stat. Negative values penalize. 0 = not scored.</p>
            <div className="grid sm:grid-cols-2 gap-3">
              {Object.entries(scoringObj).map(([stat, pts]) => (
                <div key={stat} className="flex items-center gap-2">
                  <span className="text-sm text-slate-600 flex-1 min-w-0 truncate">{stat}</span>
                  <input type="number" step="0.01" value={pts}
                    onChange={e => setScoringObj(s => ({ ...s, [stat]: +e.target.value }))}
                    className="input w-24 text-right" />
                  <span className="text-xs text-slate-400 flex-shrink-0">pts</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── Draft ── */}
        {tab === 'Draft' && (
          <>
            <h3 className="font-semibold text-slate-900 text-base">Draft Settings</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Draft Type</label>
                <select className="select" value={form.draftType ?? 'SNAKE'} onChange={e => set('draftType', e.target.value)}>
                  <option value="SNAKE">Snake Draft</option>
                  <option value="AUCTION">Auction Draft</option>
                  <option value="LINEAR">Linear Draft</option>
                </select>
              </div>
              <div>
                <label className="label">Draft Date & Time</label>
                <input type="datetime-local" className="input" value={form.draftDate ?? ''} onChange={e => set('draftDate', e.target.value)} />
              </div>
              <div>
                <label className="label">Seconds Per Pick</label>
                <input type="number" className="input" min={30} max={600} value={form.secondsPerPick ?? 90} onChange={e => set('secondsPerPick', +e.target.value)} />
              </div>
              {form.draftType === 'AUCTION' && (
                <div>
                  <label className="label">Auction Budget ($)</label>
                  <input type="number" className="input" min={50} max={1000} value={form.auctionBudget ?? 200} onChange={e => set('auctionBudget', +e.target.value)} />
                </div>
              )}
              <div className="sm:col-span-2 flex items-center gap-3">
                <input type="checkbox" id="autopick" checked={!!form.autoPickEnabled} onChange={e => set('autoPickEnabled', e.target.checked)} className="w-4 h-4" />
                <label htmlFor="autopick" className="text-sm text-slate-700">Enable auto-pick when a team runs out of time</label>
              </div>
            </div>
          </>
        )}

        {/* ── Waivers ── */}
        {tab === 'Waivers' && (
          <>
            <h3 className="font-semibold text-slate-900 text-base">Waiver Settings</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Waiver Type</label>
                <select className="select" value={form.waiverType ?? 'PRIORITY'} onChange={e => set('waiverType', e.target.value)}>
                  <option value="PRIORITY">Waiver Priority Order</option>
                  <option value="FAAB">FAAB (Free Agent Acquisition Budget)</option>
                  <option value="FREE_AGENT">Free Agent (First-Come, First-Served)</option>
                </select>
              </div>
              {form.waiverType === 'FAAB' && (
                <div>
                  <label className="label">FAAB Budget per Team ($)</label>
                  <input type="number" className="input" min={0} max={10000} value={form.faabBudget ?? 100} onChange={e => set('faabBudget', +e.target.value)} />
                </div>
              )}
              <div>
                <label className="label">Waiver Processing Day</label>
                <select className="select" value={form.waiverDay ?? 3} onChange={e => set('waiverDay', +e.target.value)}>
                  {days.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Games Lock On</label>
                <select className="select" value={form.lockDay ?? 0} onChange={e => set('lockDay', +e.target.value)}>
                  {days.map((d, i) => <option key={d} value={i}>{d} (game day)</option>)}
                </select>
              </div>
            </div>
          </>
        )}

        {/* ── Trades ── */}
        {tab === 'Trades' && (
          <>
            <h3 className="font-semibold text-slate-900 text-base">Trade Settings</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Trade Review Process</label>
                <select className="select" value={form.tradeReview ?? 'COMMISSIONER'} onChange={e => set('tradeReview', e.target.value)}>
                  <option value="NONE">No review — process immediately</option>
                  <option value="COMMISSIONER">Commissioner approval required</option>
                  <option value="LEAGUE_VOTE">League-wide veto vote</option>
                </select>
              </div>
              <div>
                <label className="label">Review Period (hours)</label>
                <input type="number" className="input" min={0} max={168} value={form.tradeReviewHours ?? 48} onChange={e => set('tradeReviewHours', +e.target.value)} />
              </div>
              {form.tradeReview === 'LEAGUE_VOTE' && (
                <div>
                  <label className="label">Votes Required to Veto</label>
                  <input type="number" className="input" min={2} max={20} value={form.vetoVotesRequired ?? 4} onChange={e => set('vetoVotesRequired', +e.target.value)} />
                </div>
              )}
              <div>
                <label className="label">Trade Deadline</label>
                <input type="datetime-local" className="input" value={form.tradeDeadline ?? ''} onChange={e => set('tradeDeadline', e.target.value)} />
                <p className="text-xs text-slate-400 mt-1">Leave blank for no deadline</p>
              </div>
            </div>
            <div className="p-4 bg-blue-50 rounded-xl text-sm text-blue-800 border border-blue-100">
              <strong>Cross-sport trades</strong> are enabled for all leagues on this platform. Teams can include players and picks from any sport in a single trade proposal.
            </div>
          </>
        )}

        {/* ── Playoffs ── */}
        {tab === 'Playoffs' && (
          <>
            <h3 className="font-semibold text-slate-900 text-base">Playoff Settings</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Playoff Teams</label>
                <select className="select" value={form.playoffTeams ?? 4} onChange={e => set('playoffTeams', +e.target.value)}>
                  {[2,4,6,8].map(n => <option key={n} value={n}>{n} teams</option>)}
                </select>
              </div>
              <div>
                <label className="label">Regular Season Weeks</label>
                <input type="number" className="input" min={6} max={25} value={form.regularSeasonWeeks ?? 14} onChange={e => set('regularSeasonWeeks', +e.target.value)} />
              </div>
              <div>
                <label className="label">Playoffs Start Week</label>
                <input type="number" className="input" min={1} max={30} value={form.playoffStartWeek ?? 15} onChange={e => set('playoffStartWeek', +e.target.value)} />
              </div>
              <div>
                <label className="label">Playoff Rounds</label>
                <select className="select" value={form.playoffRounds ?? 2} onChange={e => set('playoffRounds', +e.target.value)}>
                  <option value={1}>1 round (Finals only)</option>
                  <option value={2}>2 rounds (Semis + Finals)</option>
                  <option value={3}>3 rounds (Quarters, Semis, Finals)</option>
                </select>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
