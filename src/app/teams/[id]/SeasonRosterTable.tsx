'use client'

import { useState } from 'react'
import Link from 'next/link'
import { sportMeta } from '@/lib/utils'
import { boxScoreColumns } from '@/lib/scoring-categories'
import type { SeasonRosterPlayer } from '@/lib/seasons'

const SPORTS = ['NFL', 'NHL', 'NBA', 'MLB']
const STARTER = (slot: string) => !['BN', 'IR', 'IL', 'DL', 'TAXI'].includes(slot)
const SLOT_ORDER: Record<string, string[]> = {
  NFL: ['QB', 'RB', 'WR', 'TE', 'RB/WR/TE', 'WR/RB', 'FLEX', 'OP', 'DEF', 'D/ST', 'DST', 'K'],
  NBA: ['PG', 'SG', 'SF', 'PF', 'C', 'G', 'F', 'UTIL'],
  NHL: ['C', 'LW', 'RW', 'D', 'G', 'UTIL'],
  MLB: ['C', '1B', '2B', '3B', 'SS', 'OF', 'LF', 'CF', 'RF', 'UTIL', 'SP', 'RP', 'P'],
}

export default function SeasonRosterTable({ players, season }: { players: SeasonRosterPlayer[]; season: string }) {
  const sportsPresent = SPORTS.filter(s => players.some(p => p.sport === s))
  const [sport, setSport] = useState(sportsPresent[0] ?? 'NFL')

  const order = SLOT_ORDER[sport] ?? []
  const rankSlot = (s: string) => { const i = order.indexOf(s); return i === -1 ? 99 : i }
  const rankPos = (p: SeasonRosterPlayer) => rankSlot(p.position)
  const cols = boxScoreColumns(sport)

  const forSport = players.filter(p => p.sport === sport)
  const lineup = forSport.filter(p => STARTER(p.slot)).sort((a, b) => rankSlot(a.slot) - rankSlot(b.slot) || b.seasonPoints - a.seasonPoints)
  const bench = forSport.filter(p => p.slot === 'BN').sort((a, b) => rankPos(a) - rankPos(b) || b.seasonPoints - a.seasonPoints)
  const taxi = forSport.filter(p => p.slot === 'TAXI').sort((a, b) => rankPos(a) - rankPos(b) || b.seasonPoints - a.seasonPoints)
  const ir = forSport.filter(p => ['IR', 'IL', 'DL'].includes(p.slot)).sort((a, b) => rankPos(a) - rankPos(b) || b.seasonPoints - a.seasonPoints)

  const renderHead = () => (
    <thead className="bg-slate-50">
      <tr className="text-[10px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
        <th className="text-left px-2 py-2 font-semibold">Slot</th>
        <th className="text-left px-2 py-2 font-semibold">Player</th>
        <th className="text-right px-1.5 py-2 font-semibold hidden sm:table-cell">Avg</th>
        <th className="text-right px-1.5 py-2 font-semibold hidden md:table-cell">GP</th>
        <th className="text-right px-2 py-2 font-semibold">Pts</th>
        {cols.map(c => <th key={c.label} className="text-right px-1.5 py-2 font-semibold whitespace-nowrap hidden lg:table-cell">{c.label}</th>)}
      </tr>
    </thead>
  )

  const renderRow = (p: SeasonRosterPlayer, i: number) => (
    <tr key={`${p.playerId ?? p.name}-${i}`} className="hover:bg-slate-50">
      <td className="px-2 py-1.5">
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${STARTER(p.slot) ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{p.slot}</span>
      </td>
      <td className="px-2 py-1.5 sm:whitespace-nowrap">
        {p.playerId
          ? <Link href={`/players/${p.playerId}`} className="font-medium text-slate-900 hover:text-blue-600">{p.name}</Link>
          : <span className="font-medium text-slate-900">{p.name}</span>}
        <span className="text-[11px] text-slate-400"> {p.position}{p.realTeamAbbr ? ` · ${p.realTeamAbbr}` : ''}</span>
      </td>
      <td className="px-1.5 py-1.5 text-right tabular-nums text-slate-500 hidden sm:table-cell">{(p.weeklyAvg ?? 0).toFixed(1)}</td>
      <td className="px-1.5 py-1.5 text-right tabular-nums text-slate-400 hidden md:table-cell">{p.gp ?? 0}</td>
      <td className="px-2 py-1.5 text-right font-bold tabular-nums text-slate-900">{(p.seasonPoints ?? 0).toFixed(1)}</td>
      {cols.map(c => {
        const v = +c.get(p.seasonStats ?? {}).toFixed(0)
        return <td key={c.label} className="px-1.5 py-1.5 text-right tabular-nums text-slate-600 hidden lg:table-cell">{v || '—'}</td>
      })}
    </tr>
  )

  if (!sportsPresent.length) return <div className="card p-8 text-center text-slate-400 text-sm">No roster recorded for this season.</div>

  return (
    <>
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        {sportsPresent.map(s => (
          <button key={s} onClick={() => setSport(s)} className={`px-3 py-1.5 rounded-full text-xs font-semibold ${sport === s ? `${sportMeta(s).bg} text-white` : 'bg-slate-100 text-slate-600'}`}>
            {sportMeta(s).emoji} {s} ({players.filter(p => p.sport === s).length})
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {([
          { key: 'Starting Lineup', rows: lineup },
          { key: 'Bench', rows: bench },
          { key: 'Taxi Squad', rows: taxi },
          { key: 'Injured Reserve', rows: ir },
        ] as const).filter(s => s.rows.length > 0).map(section => (
          <div key={section.key} className="card overflow-hidden">
            <div className="card-header flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">{section.key}</h2>
              <span className="text-xs text-slate-400">{section.rows.length} {section.rows.length === 1 ? 'player' : 'players'}</span>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                {renderHead()}
                <tbody className="divide-y divide-slate-50">{section.rows.map(renderRow)}</tbody>
              </table>
            </div>
          </div>
        ))}
        {!forSport.length && <div className="card p-8 text-center text-slate-400 text-sm">No {sport} players rostered in {season}.</div>}
      </div>
    </>
  )
}
