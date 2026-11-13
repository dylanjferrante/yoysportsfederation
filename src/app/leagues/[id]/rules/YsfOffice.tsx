// ySF Site Redesign — League Office: the Constitution & Bylaws (articles), quick reference, each
// league's scoring and roster rules, and the Commission's directives and resolutions.
import Link from 'next/link'
import { YSF_LEAGUES, YSF_ART, U } from '@/lib/ysf'
import { siteFeed } from '@/lib/ysf-data'
import { PageTitle, th, td } from '@/components/ysf/ui'
import { loadConstitution, DOC_URL } from '@/lib/ysf-constitution'
import { auditLeague } from '@/lib/ysf-audit'
import { usage } from '@/lib/api-usage'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import WarnButton from './WarnButton'
import { ensureWarnings } from '@/lib/ysf-rules'
import { LEAGUE_OF } from '@/lib/ysf-rules'
import { db } from '@/db'
import { sql } from 'drizzle-orm'

// full-text styling for the official document's HTML
const DOC = 'text-[15px] leading-relaxed text-ink-800 [&_.cl]:flex [&_.cl]:gap-2 [&_.cl]:mt-2 [&_.cm]:flex-none [&_.cm]:min-w-[2.4em] [&_.cm]:font-bold [&_.cm]:text-black [&_.cm]:tabular-nums [&_.cl>div]:min-w-0 [&_.cl>div]:flex-1 [&_.cl>div>*:first-child]:mt-0 [&_p]:mt-2 [&_b]:font-bold [&_b]:text-black [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mt-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mt-1 [&_li]:mt-1 [&_h2]:ui [&_h2]:text-[14px] [&_h2]:font-bold [&_h2]:tracking-[.1em] [&_h2]:mt-5 [&_h2]:text-black [&_h3]:font-bold [&_h3]:mt-4 [&_h3]:text-black [&_h4]:font-semibold [&_h4]:mt-3 [&_table]:w-full [&_table]:mt-2 [&_td]:border [&_td]:border-ink-100 [&_td]:px-2 [&_td]:py-1'

const TABS: [string, string][] = [['constitution', 'CONSTITUTION'], ['scoring', 'SCORING'], ['rosters', 'ROSTERS & SEASONS'], ['resolutions', 'RESOLUTIONS'], ['compliance', 'COMPLIANCE']]
const SPORT_KEY: Record<string, string> = { NFL: 'fl', NHL: 'hl', NBA: 'ba', MLB: 'lb' }
const etStamp = (d: Date | null) => d ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d) + ' ET' : '—'
// each rule the app enforces, where it comes from, and where it's enforced
const RULEBOOK: [string, string, string][] = [
  ['Taxi Squads: ySFFL 3 · ySFHL 4 · ySFBA 3 · ySFLB 5', 'Comm. Res. VII', 'Lineup moves'],
  ['Taxi Squad eligibility: under 1 year (NFL, NBA, MLB service time); 84 or fewer NHL games', 'Comm. Res. VII', 'Lineup moves'],
  ['Taxi Squads fill after the Rookie Draft and lock at the season’s first game; a player taken off can’t go back', 'Comm. Res. VII', 'Lineup moves'],
  ['Max 3 QB-eligible (ySFFL) · 4 G-eligible (ySFHL) · 13 P-eligible (ySFLB)', 'Art. V', 'Adds, claims, trades'],
  ['IR: ySFFL 2 · ySFHL 3 · ySFBA 3 · ySFLB 4, official designation only', 'Art. V fn. 5', 'Lineup moves'],
  ['A healthy player on IR locks the roster until he’s moved off', 'Art. V fn. 5', 'Adds, claims, lineup moves'],
  ['Claims: 4 per Monday–Sunday week in ySFBA, ySFHL and ySFLB, from the Rookie Draft on', 'Fed. Res. III', 'Adds, claims'],
  ['ySFLB starting pitchers: 10 games per matchup, prorated by length', 'Fed. Res. III', 'Scoring engine'],
  ['FAAB $250 per league; ties go to the worse record; FAAB may be traded', 'Art. IV §A', 'Claims, trades'],
  ['No-trade window from the deadline to the end of the playoffs locks players, picks and FAAB', 'Art. IV §B, Comm. Notice II', 'Trades'],
  ['48-hour review before a trade takes effect', 'Art. IV §B, Comm. Notice IV', 'Trades'],
  ['Bad-faith complaints; Commission veto (unanimous, 36 hours); Federation override (⅔)', 'Art. IV §B', 'Trades'],
  ['Commission club in the trade: Federation veto (⅔ of the other clubs)', 'Art. IV §B', 'Trades'],
  ['Fed Cup ties: most 1st-place finishes, then 2nd-or-better … 11th-or-better, then win percentage, then head-to-head', 'Comm. Res. IX', 'Standings'],
]
const LG_KEY: Record<string, string> = { ysf_fl: 'fl', ysf_hl: 'hl', ysf_ba: 'ba', ysf_lb: 'lb' }

export default async function YsfOffice({ league, tab }: { league: any; tab?: string }) {
  const [c, doc] = await Promise.all([siteFeed<any>('constitution.json'), loadConstitution()])
  const t = TABS.find(x => x[0] === tab)?.[0] ?? 'constitution'
  const base = `/leagues/${league.id}/rules`
  if (!c) return <><PageTitle title="LEAGUE OFFICE" /><div className="card p-8 text-center font-semibold text-ink-500">The Constitution couldn’t be loaded</div></>
  const chipCls = 'inline-flex items-center justify-center h-10 px-4 rounded-lg font-display text-[13px] font-medium tracking-[.08em] leading-none whitespace-nowrap'
  const lgOf = (name: string) => YSF_LEAGUES.find(l => l.code === name)
  const resolutions = (c.rules_and_resolutions ?? []) as { id: string; type: string; title: string; date: string; proposer: string; content: string }[]

  return (
    <>
      <PageTitle eyebrow={`${c.title} · enacted ${c.enacted}`} title="LEAGUE OFFICE" right={
        <div className="flex gap-1 p-1 bg-white border border-ink-100 rounded-xl overflow-x-auto max-w-full">
          {TABS.map(([k, l]) => <Link key={k} href={k === 'constitution' ? base : `${base}?tab=${k}`} className={`${chipCls} ${t === k ? 'bg-black text-white' : 'text-ink-500 hover:bg-ink-50'}`}>{l}</Link>)}
        </div>} />

      {t === 'constitution' && (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] items-start">
          {doc?.articles.length ? (
          <article className="flex flex-col gap-8">
            {doc.articles.map((a, i) => (
              <section key={i} id={`art${i + 1}`}>
                <h2 className="disp text-[26px] sm:text-[32px] font-extrabold leading-none border-b-2 border-black pb-2">ARTICLE {['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'][i]} · {U(a.title)}</h2>
                <div className={`${DOC} mt-3`} dangerouslySetInnerHTML={{ __html: a.html }} />
              </section>
            ))}
          </article>
          ) : (
          <article className="flex flex-col gap-8">
            {(c.articles ?? []).map((a: any) => (
              <section key={a.id} id={a.id}>
                <h2 className="disp text-[26px] sm:text-[32px] font-extrabold leading-none border-b-2 border-black pb-2">ARTICLE {a.number} · {U(a.title)}</h2>
                {(a.sections ?? []).map((sct: any) => (
                  <div key={sct.id} id={sct.id} className="mt-4">
                    <h3 className="ui text-[13px] font-bold tracking-[.1em]">{U(sct.title)}</h3>
                    <p className="text-[15px] leading-relaxed text-ink-800 mt-1.5"><span className="ysf-case">{sct.content}</span></p>
                  </div>
                ))}
              </section>
            ))}
          </article>
          )}
          <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
            <div className="card overflow-hidden">
              <div className="ui px-4 py-2.5 bg-black text-white text-[12px] font-bold tracking-[.12em]">QUICK REFERENCE</div>
              {Object.entries(c.quick_reference ?? {}).map(([k, v]) => (
                <div key={k} className="px-4 py-2.5 border-t border-ink-50">
                  <div className="ui text-[10px] tracking-[.12em] text-ink-500">{k.replace(/_/g, ' ').toUpperCase()}</div>
                  <div className="text-[14px] leading-snug mt-0.5"><span className="ysf-case">{String(v)}</span></div>
                </div>
              ))}
            </div>
            <div className="card overflow-hidden">
              <div className="ui px-4 py-2.5 border-b-2 border-black text-[12px] font-bold tracking-[.12em]">ARTICLES</div>
              {(doc?.articles.length ? doc.articles.map((a, i) => ({ id: `art${i + 1}`, number: ['I', 'II', 'III', 'IV', 'V', 'VI'][i], title: a.title })) : (c.articles ?? [])).map((a: any) => <a key={a.id} href={`#${a.id}`} className="block px-4 py-2 border-t border-ink-50 text-[14px] hover:bg-ink-50"><b>{a.number}.</b> {a.title}</a>)}
            </div>
            <a href={DOC_URL} target="_blank" rel="noreferrer" className="ui text-[12px] font-bold tracking-[.12em]">OFFICIAL DOCUMENT →</a>
          </aside>
        </div>
      )}

      {t === 'scoring' && (
        <div className="grid gap-4 md:grid-cols-2 items-start">
          {Object.entries(c.scoring ?? {}).map(([k, s]: [string, any]) => { const L = YSF_LEAGUES.find(l => l.key === LG_KEY[k]) ?? lgOf(s.name); return (
            <section key={k} className="card overflow-hidden">
              <div className="flex items-center gap-2.5 px-4 py-3 text-white" style={{ background: L?.color ?? '#000' }}>
                {L && <img src={YSF_ART.leagueSymbol(L.key, 'color')} alt="" className="w-7 h-7 object-contain" />}
                <span className="disp text-[22px] font-extrabold ysf-case">{s.name}</span>
              </div>
              {(s.categories ?? []).map((cat: any) => (
                <div key={cat.name}>
                  <div className="ui px-4 pt-3 pb-1 text-[11px] tracking-[.12em] text-ink-500">{U(cat.name)}</div>
                  {(cat.items ?? []).map((it: any) => (
                    <div key={it.stat} className="flex items-center justify-between gap-3 px-4 py-1.5 border-t border-ink-50 text-[14px]">
                      <span>{it.stat}</span><span className="font-bold tabular-nums">{it.value}</span>
                    </div>
                  ))}
                </div>
              ))}
            </section>) })}
        </div>
      )}

      {t === 'rosters' && (
        <div className="flex flex-col gap-4">
          <section className="card">
            <table className="w-full border-collapse">
              <thead><tr><th className={th}>LEAGUE</th><th className={`${th} text-right`}>STARTERS</th><th className={`${th} text-right`}>BENCH</th><th className={th}>LIMITS</th></tr></thead>
              <tbody>{(c.roster_sizes ?? []).map((r: any) => { const L = lgOf(r.league); return (
                <tr key={r.league}><td className={td}><span className="inline-flex items-center gap-1.5">{L && <img src={YSF_ART.leagueSymbol(L.key, 'white')} alt="" className="w-5 h-5 object-contain" />}<span className="ysf-case">{r.league}</span></span></td>
                  <td className={`${td} text-right`}>{r.starters}</td><td className={`${td} text-right`}>{r.bench}</td><td className={`${td} font-normal`}>{r.limits}</td></tr>) })}</tbody>
            </table>
          </section>
          <section className="grid gap-4 md:grid-cols-2">
            {Object.entries(c.scoring ?? {}).map(([k, s]: [string, any]) => { const L = YSF_LEAGUES.find(l => l.key === LG_KEY[k]); return (
              <div key={k} className="card p-4" style={{ borderTop: `4px solid ${L?.color ?? '#000'}` }}>
                <div className="disp text-[20px] font-extrabold ysf-case">{s.name}</div>
                <div className="text-[14px] mt-2"><span className="ui text-[11px] text-ink-500 tracking-[.1em] block">ROSTER</span>{s.roster}</div>
                <div className="text-[14px] mt-2"><span className="ui text-[11px] text-ink-500 tracking-[.1em] block">SEASON</span>{s.season}</div>
              </div>) })}
          </section>
          {c.playoffs && (
            <section className="card p-4">
              <div className="ui text-[12px] font-bold tracking-[.12em]">PLAYOFFS</div>
              <p className="text-[15px] mt-2">{c.playoffs.format}</p>
              <ul className="mt-2 flex flex-col gap-1 text-[14px] text-ink-800">{(c.playoffs.rounds ?? []).map((r: string) => <li key={r}>• {r}</li>)}</ul>
            </section>
          )}
        </div>
      )}

      {t === 'compliance' && <Compliance season={league.season} leagueId={league.id} commissionerId={league.commissionerId} />}

      {t === 'resolutions' && (
        <section className="flex flex-col gap-4">
          {(doc?.resolutions ?? []).map((r, i) => {
            const bg = r.status === 'Passed' ? '#177245' : r.status === 'Failed' ? '#ba0c2f' : r.status === 'Issued' ? '#000' : r.status === 'Open' ? '#6da7ee' : '#8A8A8A'
            const badge = 'ui inline-flex items-center justify-center h-[22px] px-2 rounded-[2px] text-[11px] font-bold leading-none flex-none'
            return (
              <article key={i} className="card p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h2 className="disp text-[20px] sm:text-[24px] font-extrabold leading-tight min-w-0 flex-1">{r.title}</h2>
                  <span className="flex gap-1.5 flex-none">
                    {r.emergency && <span className={`${badge} border border-black text-black`}>EMERGENCY</span>}
                    {r.type && <span className={`${badge} border border-black text-black`}>{r.type.toUpperCase()}</span>}
                    <span className={`${badge} text-white`} style={{ background: bg }}>{r.status.toUpperCase()}</span>
                  </span>
                </div>
                {r.text
                  ? <div className="text-[15px] leading-relaxed text-ink-800 mt-2 whitespace-pre-wrap"><span className="ysf-case">{r.text}</span></div>
                  : <div className={`${DOC} mt-2`} dangerouslySetInnerHTML={{ __html: r.html }} />}
                {r.tally && (
                  <div className="mt-4 border-t border-ink-100 pt-3">
                    <div className="ui text-[12px] font-bold tracking-[.12em]">{r.status === 'Open' ? 'VOTING' : 'RESULT'}</div>
                    <div className="text-[14px] font-semibold mt-1">{r.tally}</div>
                    {!!r.votes?.length && r.status !== 'Open' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 mt-2">
                        {r.votes.map(v => (
                          <div key={v.owner} className="flex items-center justify-between gap-3 py-1 border-b border-ink-50 text-[14px]">
                            <span>{v.club ?? v.owner}</span>
                            <span className="font-bold" style={{ color: /yes/i.test(v.vote) ? '#177245' : /no/i.test(v.vote) ? '#ba0c2f' : '#8A8A8A' }}>{v.vote.toUpperCase()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </article>
            )
          })}
          {!doc && resolutions.map(r => (
            <div key={r.id} className="card p-4">
              <div className="disp text-[20px] font-extrabold leading-tight">{r.title}</div>
              <p className="text-[15px] leading-relaxed text-ink-800 mt-2"><span className="ysf-case">{r.content}</span></p>
            </div>
          ))}
        </section>
      )}
    </>
  )
}

async function Compliance({ season, leagueId, commissionerId }: { season?: string; leagueId: string; commissionerId?: string | null }) {
  const { findings, windows } = await auditLeague(season)
  const session = await getServerSession(authOptions)
  const isCommish = !!session?.user?.id && session.user.id === commissionerId
  ensureWarnings()
  const warned = new Map(db.all<{ k: string; at: string }>(sql`SELECT team_id || '|' || rule k, MAX(warned_at) at FROM ysf_warnings GROUP BY team_id, rule`).map(w => [w.k, w.at]))
  const wStamp = (iso: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(iso))
  const clubs = new Map(db.all<{ id: string; name: string; logo: string | null }>(sql`SELECT id, name, logo FROM teams WHERE league_id = 'ysf'`).map(c => [c.id, c]))
  const now = Date.now()
  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-4 lg:grid-cols-2 items-start">
        {['NFL', 'NHL', 'NBA', 'MLB'].map(sp => {
          const L = YSF_LEAGUES.find(l => l.key === SPORT_KEY[sp])
          const fs = findings.filter(f => f.sport === sp).sort((a, b) => (clubs.get(a.teamId)?.name ?? '').localeCompare(clubs.get(b.teamId)?.name ?? ''))
          return (
            <div key={sp} className="card overflow-hidden">
              <div className="flex items-center gap-2.5 px-4 py-3 text-white" style={{ background: L?.color ?? '#000' }}>
                {L && <img src={YSF_ART.leagueSymbol(L.key, 'color')} alt="" className="w-7 h-7 object-contain" />}
                <span className="disp text-[22px] font-extrabold ysf-case">{LEAGUE_OF[sp]}</span>
                <span className="ui ml-auto inline-flex items-center justify-center h-[22px] px-2 rounded-[2px] text-[11px] font-bold leading-none bg-white" style={{ color: L?.color ?? '#000' }}>{fs.length ? `${fs.length} ISSUE${fs.length > 1 ? 'S' : ''}` : 'CLEAR'}</span>
              </div>
              {fs.length ? (
                <table className="w-full border-collapse table-fixed">
                  <thead><tr><th className={`${th} w-[34%]`}>CLUB</th><th className={th}>RULE</th><th className={`${th} hidden sm:table-cell w-[22%]`}>SOURCE</th></tr></thead>
                  <tbody>{fs.map((f, i) => { const c = clubs.get(f.teamId); return (
                    <tr key={i}>
                      <td className={`${td} !whitespace-normal break-words`}><span className="inline-flex items-center gap-1.5">{c?.logo && <img src={c.logo} alt="" className="w-5 h-5 object-contain flex-none" />}<span>{c?.name ?? '—'}</span></span></td>
                      <td className={`${td} !whitespace-normal break-words`}><div>{f.rule}</div><div className="text-[13px] font-normal text-ink-600 mt-0.5"><span className="ysf-case">{f.detail}</span></div>
                        {(warned.get(`${f.teamId}|${f.rule}`) || isCommish) && <div className="mt-1.5 flex items-center gap-2">
                          {warned.get(`${f.teamId}|${f.rule}`) && <span className="ui inline-flex items-center justify-center h-[22px] px-2 rounded-[2px] text-[11px] font-bold leading-none text-white bg-[#ba0c2f]">WARNED {wStamp(warned.get(`${f.teamId}|${f.rule}`)!).toUpperCase()}</span>}
                          {isCommish && <WarnButton leagueId={leagueId} teamId={f.teamId} sport={f.sport} rule={f.rule} detail={f.detail} />}
                        </div>}</td>
                      <td className={`${td} hidden sm:table-cell !whitespace-normal font-normal text-[13px]`}>{f.source}</td>
                    </tr>) })}</tbody>
                </table>
              ) : <div className="px-4 py-4 text-[15px] font-semibold text-ink-500">No violations</div>}
            </div>
          )
        })}
      </section>

      <section className="card">
        <div className="ui px-4 py-2.5 border-b-2 border-black text-[12px] font-bold tracking-[.12em]">TRADE DEADLINES</div>
        <table className="w-full border-collapse">
          <thead><tr><th className={th}>LEAGUE</th><th className={th}>DEADLINE</th><th className={`${th} hidden sm:table-cell`}>REOPENS</th><th className={`${th} text-right`}>TRADES</th></tr></thead>
          <tbody>{windows.map(w => { const L = YSF_LEAGUES.find(l => l.key === SPORT_KEY[w.sport]); const open = !w.locked && (!w.deadline || now <= w.deadline.getTime()); return (
            <tr key={w.sport}>
              <td className={td}><span className="inline-flex items-center gap-1.5">{L && <img src={YSF_ART.leagueSymbol(L.key, 'white')} alt="" className="w-5 h-5 object-contain" />}<span className="ysf-case">{LEAGUE_OF[w.sport]}</span></span></td>
              <td className={`${td} !whitespace-normal break-words font-normal`}>{etStamp(w.deadline)}</td>
              <td className={`${td} hidden sm:table-cell font-normal`}>{etStamp(w.reopens)}</td>
              <td className={`${td} text-right`}><span className="ui inline-flex items-center justify-center h-[22px] px-2 rounded-[2px] text-[11px] font-bold leading-none text-white" style={{ background: open ? '#177245' : w.locked ? '#ba0c2f' : '#8A8A8A' }}>{open ? 'OPEN' : w.locked ? 'LOCKED' : 'CLOSED'}</span></td>
            </tr>) })}</tbody>
        </table>
      </section>

      {(() => { const u = usage(); return (
        <section className="card p-4 flex flex-wrap gap-x-8 gap-y-2 items-baseline">
          <div className="ui text-[12px] font-bold tracking-[.12em] w-full sm:w-auto">TANK01 API CALLS</div>
          <div><span className="disp text-[28px] font-extrabold tabular-nums">{(u.today.tank01 ?? 0).toLocaleString()}</span> <span className="text-ink-500 font-semibold">today</span></div>
          <div><span className="disp text-[28px] font-extrabold tabular-nums">{(u.month.tank01 ?? 0).toLocaleString()}</span> <span className="text-ink-500 font-semibold">this month</span></div>
        </section>) })()}

      <section className="card">
        <div className="ui px-4 py-2.5 border-b-2 border-black text-[12px] font-bold tracking-[.12em]">RULE BOOK</div>
        <table className="w-full border-collapse table-fixed">
          <thead><tr><th className={th}>RULE</th><th className={`${th} w-[28%] sm:w-[22%]`}>SOURCE</th><th className={`${th} hidden sm:table-cell w-[22%]`}>CHECKED ON</th></tr></thead>
          <tbody>{RULEBOOK.map(([r, src, where]) => (
            <tr key={r}><td className={`${td} !whitespace-normal break-words`}><span className="ysf-case">{r}</span></td><td className={`${td} !whitespace-normal break-words font-normal text-[13px]`}>{src}</td><td className={`${td} hidden sm:table-cell !whitespace-normal font-normal text-[13px]`}>{where}</td></tr>
          ))}</tbody>
        </table>
      </section>
    </div>
  )
}
