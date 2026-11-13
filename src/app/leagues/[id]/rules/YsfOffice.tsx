// ySF Site Redesign — League Office: the Constitution & Bylaws (articles), quick reference, each
// league's scoring and roster rules, and the Commission's directives and resolutions.
import Link from 'next/link'
import { YSF_LEAGUES, YSF_ART, U } from '@/lib/ysf'
import { siteFeed } from '@/lib/ysf-data'
import { PageTitle, th, td } from '@/components/ysf/ui'

const TABS: [string, string][] = [['constitution', 'CONSTITUTION'], ['scoring', 'SCORING'], ['rosters', 'ROSTERS & SEASONS'], ['resolutions', 'RESOLUTIONS']]
const LG_KEY: Record<string, string> = { ysf_fl: 'fl', ysf_hl: 'hl', ysf_ba: 'ba', ysf_lb: 'lb' }

export default async function YsfOffice({ league, tab }: { league: any; tab?: string }) {
  const c = await siteFeed<any>('constitution.json')
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
              {(c.articles ?? []).map((a: any) => <a key={a.id} href={`#${a.id}`} className="block px-4 py-2 border-t border-ink-50 text-[14px] hover:bg-ink-50"><b>{a.number}.</b> {a.title}</a>)}
            </div>
            {c.doc_url && <a href={c.doc_url} target="_blank" rel="noreferrer" className="ui text-[12px] font-bold tracking-[.12em]">OFFICIAL DOCUMENT →</a>}
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

      {t === 'resolutions' && (
        <section className="flex flex-col gap-3">
          {resolutions.map(r => (
            <div key={r.id} className="card p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="disp text-[20px] font-extrabold leading-tight">{r.title}</span>
                <span className="ui text-[11px] tracking-[.1em] text-ink-500">{U(`${r.type} · ${r.date} · ${r.proposer}`)}</span>
              </div>
              <p className="text-[15px] leading-relaxed text-ink-800 mt-2"><span className="ysf-case">{r.content}</span></p>
            </div>
          ))}
        </section>
      )}
    </>
  )
}
