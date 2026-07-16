'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { SEASON_STARTS, buildSchedule, formatWeekRange } from '@/lib/defaults'
import { sportMeta } from '@/lib/utils'

const ALL_SPORTS = ['NFL', 'NHL', 'NBA', 'MLB']

export default function CreateLeaguePage() {
  const router = useRouter()
  const { data: session } = useSession()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState<any>({
    name: '', teamName: '', season: '2026-27', logoUrl: '',
    sportsEnabled: ['NFL', 'NHL', 'NBA', 'MLB'], seasonStart: 'FOOTBALL', maxTeams: 12,
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
    router.push(`/leagues/${league.id}/settings?setup=1`)
  }

  if (!session) return (
    <div className="max-w-xl mx-auto px-4 py-16 text-center">
      <p className="text-slate-500 mb-4">Sign in to create a league.</p>
      <Link href="/auth/login" className="btn-primary">Sign In</Link>
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Create a Federation</h1>
        <p className="text-slate-500 text-sm mt-1">Start with the essentials. After this you'll walk through rosters, scoring, draft, playoffs and the rest before inviting owners.</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">{error}</div>}

      <div className="card p-6 space-y-5">
        <div><label className="label">League Name</label><input className="input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Nexus Federation" /></div>
        <div><label className="label">Your Club Name</label><input className="input" value={form.teamName} onChange={e => set('teamName', e.target.value)} placeholder="Apex Dynasty" /></div>

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

        {form.sportsEnabled.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold text-slate-600 mb-2">Season schedule preview</p>
            <div className="space-y-1.5">
              {buildSchedule(form.seasonStart, form.sportsEnabled).map(e => (
                <div key={e.sport} className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className={`inline-flex items-center gap-1 font-semibold w-14 ${sportMeta(e.sport).color}`}><span>{sportMeta(e.sport).emoji}</span>{e.sport}</span>
                  <span className="text-slate-600">Weeks {e.startWeek}–{e.endWeek}</span>
                  <span className="text-slate-400">{formatWeekRange(form.season, e.startWeek, { year: true, seasonStart: form.seasonStart })} → {formatWeekRange(form.season, e.endWeek, { year: true, seasonStart: form.seasonStart })}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Season</label>
            <select className="select" value={form.season} onChange={e => set('season', e.target.value)}>
              {['2026-27', '2027-28', '2028-29'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Max Clubs</label>
            <select className="select" value={form.maxTeams} onChange={e => set('maxTeams', +e.target.value)}>
              {[4, 6, 8, 10, 12, 14, 16].map(n => <option key={n} value={n}>{n} clubs</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="label">League Logo URL (optional)</label>
          <div className="flex gap-2 items-center">
            <input className="input flex-1" value={form.logoUrl} onChange={e => set('logoUrl', e.target.value)} placeholder="https://…/logo.png" />
            {form.logoUrl && <img src={form.logoUrl} alt="" className="w-10 h-10 object-contain bg-slate-100" />}
          </div>
        </div>
      </div>

      <div className="flex justify-between mt-4">
        <Link href="/leagues" className="btn-secondary">Cancel</Link>
        <button onClick={submit} disabled={loading || !form.name || form.sportsEnabled.length === 0} className="btn-primary">{loading ? 'Creating…' : 'Create & set up →'}</button>
      </div>
    </div>
  )
}
