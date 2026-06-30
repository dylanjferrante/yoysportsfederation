'use client'

import { useState } from 'react'
import Markdown from '@/components/Markdown'

export default function RulesView({ leagueId, initialRules, canEdit }: { leagueId: string; initialRules: string; canEdit: boolean }) {
  const [rules, setRules] = useState(initialRules)
  const [draft, setDraft] = useState(initialRules)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    const r = await fetch(`/api/leagues/${leagueId}/rules`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: draft }) })
    setSaving(false)
    if (r.ok) { setRules(draft); setEditing(false) }
  }

  return (
    <div className="max-w-3xl mx-auto pb-16">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-slate-900">📖 League Rules</h1>
        {canEdit && !editing && (
          <button onClick={() => { setDraft(rules); setEditing(true) }} className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-900 text-white">Edit rules</button>
        )}
      </div>

      {!editing && (
        rules.trim()
          ? <div className="rounded-xl border border-slate-200 bg-white p-6"><Markdown text={rules} /></div>
          : <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-400 text-sm">
              No rules posted yet.{canEdit ? ' Click “Edit rules” to write your league constitution.' : ''}
            </div>
      )}

      {editing && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-medium text-slate-500 mb-1">Markdown — # heading, - bullet, **bold**, *italic*, [links](url)</div>
            <textarea className="input w-full font-mono text-sm" rows={22} value={draft} onChange={e => setDraft(e.target.value)} placeholder="# Constitution&#10;&#10;## Scoring&#10;- PPR&#10;..." />
            <div className="mt-2 flex gap-2 justify-end">
              <button onClick={() => setEditing(false)} className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600">Cancel</button>
              <button disabled={saving} onClick={save} className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-900 text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save rules'}</button>
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500 mb-1">Preview</div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 min-h-[12rem]">
              {draft.trim() ? <Markdown text={draft} /> : <span className="text-slate-400 text-sm">Nothing yet…</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
