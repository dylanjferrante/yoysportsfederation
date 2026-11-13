import { db } from '@/db'
import { leagues } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { PageTitle } from '@/components/ysf/ui'
import { buildLeagueNews } from '@/lib/leaguenews'
import YsfNews from './YsfNews'
import { YSF_LEAGUE_ID } from '@/lib/ysf'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  return { title: `${league?.name ?? 'League'} · ${id === YSF_LEAGUE_ID ? 'News' : 'News'}` }
}

const CAT: Record<string, { label: string; cls: string; bg: string }> = {
  INJURY: { label: 'Injury', cls: '', bg: '#ba0c2f' },
  PERFORMANCE: { label: 'Performance', cls: '', bg: '#177245' },
  TRANSACTION: { label: 'Move', cls: '', bg: '#2F5D8A' },
  NOTE: { label: 'Note', cls: '', bg: '#4A4A4A' },
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

export default async function NewsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ lg?: string }> }) {
  const { id } = await params
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id)).limit(1)
  if (!league) notFound()
  if (id === YSF_LEAGUE_ID) return <div className="flex flex-col gap-5"><YsfNews league={league} /></div>
  const items = await buildLeagueNews(id)

  return (
    <div>
      <div className="mb-6"><PageTitle eyebrow="Rostered players · injuries and updates" title="NEWS" /></div>

      {items.length === 0 ? (
        <div className="card p-10 text-center text-ink-500 font-semibold">No news right now</div>
      ) : (
        <div className="card divide-y divide-ink-50 overflow-hidden">
          {items.map(n => {
            const cat = CAT[n.category] ?? CAT.NOTE
            const c = n.club
            const primary = c?.primaryColor || '#0f172a'
            const secondary = c?.secondaryColor || '#ffffff'
            return (
              <div key={n.id} className="flex gap-3 px-3 sm:px-4 py-3">
                {n.photoUrl
                  ? <img src={n.photoUrl} alt="" className="w-10 h-10 rounded object-cover bg-ink-50 flex-shrink-0" />
                  : <span className="w-10 h-10 rounded bg-ink-50 flex items-center justify-center ui text-[10px] font-bold text-ink-500 flex-shrink-0">{n.playerName.split(' ').map(w => w[0]).slice(0, 2).join('')}</span>}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="ui inline-flex items-center justify-center h-[20px] px-2 rounded-[2px] text-[10px] font-bold leading-none" style={{ background: cat.bg, color: '#fff' }}>{cat.label.toUpperCase()}</span>
                    <span className="text-[14px] truncate"><b>{n.playerName}</b> <span className="text-ink-500 ml-2">{n.realTeam}</span> <span className="text-ink-500 ml-2">{n.position}</span></span>
                    <span className="text-[11px] text-ink-400 ml-auto flex-shrink-0">{ago(n.createdAt)}</span>
                  </div>
                  {n.headline && <p className="text-[14px] text-black mt-1">{n.headline}</p>}
                  {n.body && <p className="text-[13px] text-ink-500 mt-0.5 line-clamp-2">{n.body}</p>}
                  {c && (
                    <Link href={`/leagues/${id}/teams/${c.id}`} className="inline-flex items-center gap-1.5 mt-1.5 text-[12px] font-semibold text-black">
                      {(c.altLogo || c.logo)
                        ? <span className="w-4 h-4 inline-flex items-center justify-center flex-shrink-0"><img src={c.logo || c.altLogo || ''} alt="" className="w-full h-full object-contain" /></span>
                        : <span className="w-4 h-4 rounded flex items-center justify-center text-[7px] font-bold" style={{ background: primary, color: '#fff' }}>{(c.abbreviation || '?').slice(0, 2)}</span>}
                      {c.name}
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
