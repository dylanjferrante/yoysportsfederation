import { db } from '@/db'
import { leagues } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { buildLeagueNews } from '@/lib/leaguenews'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  return { title: `${league?.name ?? 'League'} · News` }
}

const CAT: Record<string, { label: string; cls: string }> = {
  INJURY: { label: 'Injury', cls: 'bg-red-50 text-red-600' },
  PERFORMANCE: { label: 'Performance', cls: 'bg-emerald-50 text-emerald-600' },
  TRANSACTION: { label: 'Move', cls: 'bg-blue-50 text-blue-600' },
  NOTE: { label: 'Note', cls: 'bg-slate-100 text-slate-500' },
}

function ago(iso: string | null): string {
  if (!iso) return 'Ongoing'
  const t = Date.parse(iso.replace(' ', 'T') + 'Z')
  if (Number.isNaN(t)) return ''
  const s = Math.max(0, Date.now() - t), d = Math.floor(s / 86400000), h = Math.floor(s / 3600000)
  if (d >= 1) return `${d}d ago`
  if (h >= 1) return `${h}h ago`
  return 'just now'
}

export default async function NewsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) notFound()
  const items = await buildLeagueNews(id)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">League News</h1>
        <p className="text-slate-500 text-sm">Injuries and updates for players rostered across the league.</p>
      </div>

      {items.length === 0 ? (
        <div className="card p-10 text-center text-slate-400 text-sm">No news right now — everyone&apos;s healthy and quiet.</div>
      ) : (
        <div className="card divide-y divide-slate-100 overflow-hidden">
          {items.map(n => {
            const cat = CAT[n.category] ?? CAT.NOTE
            const c = n.club
            const primary = c?.primaryColor || '#0f172a'
            const secondary = c?.secondaryColor || '#ffffff'
            return (
              <div key={n.id} className="flex gap-3 px-3 sm:px-4 py-3">
                {n.photoUrl
                  ? <img src={n.photoUrl} alt="" className="w-10 h-10 rounded-full object-cover bg-slate-100 flex-shrink-0" />
                  : <span className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-400 flex-shrink-0">{n.playerName.split(' ').map(w => w[0]).slice(0, 2).join('')}</span>}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${cat.cls}`}>{cat.label}</span>
                    <Link href={`/players/${n.playerId}`} className="font-semibold text-slate-900 hover:text-blue-600 truncate">{n.playerName}</Link>
                    <span className="text-[11px] text-slate-400">{n.position} · {n.realTeam}</span>
                    <span className="text-[11px] text-slate-300 ml-auto flex-shrink-0">{ago(n.createdAt)}</span>
                  </div>
                  {n.headline && <p className="text-sm text-slate-700 mt-0.5">{n.headline}</p>}
                  {n.body && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.body}</p>}
                  {c && (
                    <Link href={`/leagues/${id}/teams/${c.id}`} className="inline-flex items-center gap-1.5 mt-1.5 text-[11px] font-medium text-slate-500 hover:text-slate-800">
                      {(c.altLogo || c.logo)
                        ? <span className="w-4 h-4 rounded flex items-center justify-center overflow-hidden" style={{ background: c.logoBg ? primary : '#f1f5f9' }}><img src={c.altLogo || c.logo || ''} alt="" className="w-[82%] h-[82%] object-contain" /></span>
                        : <span className="w-4 h-4 rounded flex items-center justify-center text-[7px] font-bold" style={{ background: primary, color: secondary }}>{(c.abbreviation || '?').slice(0, 2)}</span>}
                      Rostered by {c.name}
                    </Link>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
