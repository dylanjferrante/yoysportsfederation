'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'

const SPORTS = [
  { key: 'NFL', emoji: '🏈', name: 'NFL Football' },
  { key: 'NBA', emoji: '🏀', name: 'NBA Basketball' },
  { key: 'NHL', emoji: '🏒', name: 'NHL Hockey' },
  { key: 'MLB', emoji: '⚾', name: 'MLB Baseball' },
]

export default function CreateLeaguePage() {
  const router = useRouter()
  const { data: session } = useSession()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    name: '',
    sport: 'NFL',
    season: '2025-26',
    maxTeams: 12,
    isPublic: false,
    description: '',
    draftType: 'SNAKE',
    auctionBudget: 200,
    secondsPerPick: 90,
    tradeReview: 'COMMISSIONER',
    tradeReviewHours: 48,
    waiverType: 'PRIORITY',
    faabBudget: 100,
    playoffTeams: 4,
    playoffStartWeek: 15,
    regularSeasonWeeks: 14,
  })

  function set(key: string, value: unknown) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function submit() {
    if (!session) return
    setLoading(true)
    setError('')
    const res = await fetch('/api/leagues', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setLoading(false)
    if (!res.ok) {
      const d = await res.json()
      return setError(d.error ?? 'Failed to create league')
    }
    const league = await res.json()
    router.push(`/leagues/${league.id}/settings`)
  }

  if (!session) return (
    <div className="max-w-xl mx-auto px-4 py-16 text-center">
      <p className="text-slate-500 mb-4">You need to be signed in to create a league.</p>
      <Link href="/auth/login" className="btn-primary">Sign In</Link>
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Create a League</h1>
        <p className="text-slate-500 text-sm mt-1">You'll be the commissioner and can adjust all settings after creation.</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {[1,2,3].map(s => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${step >= s ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-400'}`}>{s}</div>
            {s < 3 && <div className={`h-px w-8 transition-colors ${step > s ? 'bg-slate-900' : 'bg-slate-200'}`} />}
          </div>
        ))}
        <span className="text-sm text-slate-500 ml-2">{step === 1 ? 'Basics' : step === 2 ? 'League Rules' : 'Review'}</span>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">{error}</div>}

      <div className="card p-6 space-y-5">
        {/* Step 1: Basics */}
        {step === 1 && (
          <>
            <h2 className="font-semibold text-slate-900">Basic Info</h2>
            <div>
              <label className="label">League Name</label>
              <input className="input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="My Fantasy League" required />
            </div>
            <div>
              <label className="label">Sport</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {SPORTS.map(s => (
                  <button key={s.key} type="button" onClick={() => set('sport', s.key)}
                    className={`p-3 rounded-xl border-2 text-center transition-colors ${form.sport === s.key ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
                    <div className="text-2xl mb-1">{s.emoji}</div>
                    <div className="text-xs font-semibold text-slate-700">{s.key}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Season</label>
                <input className="input" value={form.season} onChange={e => set('season', e.target.value)} placeholder="2025-26" />
              </div>
              <div>
                <label className="label">Max Teams</label>
                <select className="select" value={form.maxTeams} onChange={e => set('maxTeams', +e.target.value)}>
                  {[4,6,8,10,12,14,16,20,24,32].map(n => <option key={n} value={n}>{n} teams</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="label">Visibility</label>
              <div className="flex gap-3">
                {[{ v: false, l: '🔒 Private (invite code)' },{ v: true, l: '🌐 Public (anyone can join)' }].map(o => (
                  <button key={String(o.v)} type="button" onClick={() => set('isPublic', o.v)}
                    className={`flex-1 py-2.5 px-4 rounded-lg border text-sm font-medium transition-colors ${form.isPublic === o.v ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                    {o.l}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Step 2: Rules */}
        {step === 2 && (
          <>
            <h2 className="font-semibold text-slate-900">League Rules</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Draft Type</label>
                <select className="select" value={form.draftType} onChange={e => set('draftType', e.target.value)}>
                  <option value="SNAKE">Snake Draft</option>
                  <option value="AUCTION">Auction Draft</option>
                  <option value="LINEAR">Linear Draft</option>
                </select>
              </div>
              {form.draftType === 'AUCTION' && (
                <div>
                  <label className="label">Auction Budget</label>
                  <input type="number" className="input" value={form.auctionBudget} onChange={e => set('auctionBudget', +e.target.value)} />
                </div>
              )}
              <div>
                <label className="label">Waiver Type</label>
                <select className="select" value={form.waiverType} onChange={e => set('waiverType', e.target.value)}>
                  <option value="PRIORITY">Waiver Priority</option>
                  <option value="FAAB">FAAB Bidding</option>
                  <option value="FREE_AGENT">Free Agent</option>
                </select>
              </div>
              {form.waiverType === 'FAAB' && (
                <div>
                  <label className="label">FAAB Budget ($)</label>
                  <input type="number" className="input" value={form.faabBudget} onChange={e => set('faabBudget', +e.target.value)} />
                </div>
              )}
              <div>
                <label className="label">Trade Review</label>
                <select className="select" value={form.tradeReview} onChange={e => set('tradeReview', e.target.value)}>
                  <option value="NONE">No review</option>
                  <option value="COMMISSIONER">Commissioner approval</option>
                  <option value="LEAGUE_VOTE">League vote</option>
                </select>
              </div>
              <div>
                <label className="label">Playoff Teams</label>
                <select className="select" value={form.playoffTeams} onChange={e => set('playoffTeams', +e.target.value)}>
                  {[2,4,6,8].map(n => <option key={n} value={n}>{n} teams</option>)}
                </select>
              </div>
              <div>
                <label className="label">Regular Season Weeks</label>
                <input type="number" className="input" min={6} max={25} value={form.regularSeasonWeeks} onChange={e => set('regularSeasonWeeks', +e.target.value)} />
              </div>
            </div>
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-800">
              ✅ Cross-sport trading is enabled by default — you can propose trades with players and picks from any sport.
            </div>
          </>
        )}

        {/* Step 3: Review */}
        {step === 3 && (
          <>
            <h2 className="font-semibold text-slate-900">Review & Create</h2>
            <div className="space-y-2 text-sm">
              {[
                ['League Name', form.name],
                ['Sport', form.sport],
                ['Season', form.season],
                ['Max Teams', form.maxTeams],
                ['Visibility', form.isPublic ? 'Public' : 'Private'],
                ['Draft Type', form.draftType],
                ['Waivers', form.waiverType],
                ['Trade Review', form.tradeReview],
                ['Playoff Teams', form.playoffTeams],
                ['Regular Season', `${form.regularSeasonWeeks} weeks`],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between py-1.5 border-b border-slate-50">
                  <span className="text-slate-500">{k}</span>
                  <span className="font-medium text-slate-900">{String(v)}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-2">You can customize scoring settings, roster slots, and more in the commissioner settings panel after creating the league.</p>
          </>
        )}
      </div>

      <div className="flex justify-between mt-4">
        {step > 1 ? (
          <button onClick={() => setStep(s => s - 1)} className="btn-secondary">← Back</button>
        ) : (
          <Link href="/leagues" className="btn-secondary">Cancel</Link>
        )}
        {step < 3 ? (
          <button onClick={() => { if (!form.name && step === 1) return; setStep(s => s + 1) }} className="btn-primary"
            disabled={step === 1 && !form.name}>
            Next →
          </button>
        ) : (
          <button onClick={submit} disabled={loading} className="btn-primary">
            {loading ? 'Creating…' : 'Create League'}
          </button>
        )}
      </div>
    </div>
  )
}
