// The official ySF Constitution & Bylaws, read live from its Google Doc (public HTML export) and
// split into articles and resolutions — full text, as written, with each resolution's outcome.
// Output HTML keeps only structural tags (no attributes), so it is safe to render.
const DOC_ID = '11aq9kXeGiEYDE4FjLkpUm-7umKq-TiwvQnAb-lpUMfA'
const KEEP = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'li', 'table', 'tbody', 'tr', 'td', 'th', 'br'])

export type Article = { title: string; html: string }
export type Vote = { owner: string; club: string | null; vote: string }
export type Resolution = {
  title: string; kind: 'directive' | 'resolution' | 'notice'; status: 'Passed' | 'Failed' | 'Vote not recorded' | 'Issued' | 'Open'; html: string
  // from the ySF Portal's proposal record, when there is one: the text as voted, the result and each club's vote
  text?: string; type?: string; emergency?: boolean; tally?: string; votes?: Vote[]; date?: string
  notes?: string[]   // e.g. amended by a later directive
}
export const DOC_URL = `https://docs.google.com/document/d/${DOC_ID}/edit`

// List numbering: Google Docs draws "A.", "(1)", "(a)" with CSS counters on each list level, and
// splits one list into many <ol start=N> pieces. Rebuild each item's real marker and indent so the
// articles read as numbered sections, sub-sections and clauses.
const ROMAN: [number, string][] = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]
function counter(n: number, style: string): string {
  if (/roman/.test(style)) { let r = ''; for (const [v, t] of ROMAN) while (n >= v) { r += t; n -= v } return /upper/.test(style) ? r.toUpperCase() : r }
  if (/latin|alpha/.test(style)) { let r = ''; while (n > 0) { n--; r = String.fromCharCode(97 + (n % 26)) + r; n = Math.floor(n / 26) } return /upper/.test(style) ? r.toUpperCase() : r }
  return String(n)
}

function clean(raw: string): string {
  const css = new Set<string>()
  const st = /<style type="text\/css">([\s\S]*?)<\/style>/.exec(raw)?.[1] ?? ''
  for (const m of st.matchAll(/\.(c\d+)\{([^}]*)\}/g)) if (m[2].includes('font-weight:700')) css.add(m[1])
  // each list level's marker: prefix, counter style, suffix (bulleted levels have no counter)
  const fmt: Record<string, { pre: string; style: string | null; post: string }> = {}
  for (const m of st.matchAll(/\.?(lst-kix_[a-z0-9]+-\d+)>li:before\{content:"([^"]*)"(?: counter\([^,]+,([a-z-]+)\) "([^"]*)")?\}/g))
    fmt[m[1]] = m[3] ? { pre: m[2], style: m[3], post: m[4] } : { pre: '', style: null, post: '' }
  const body = raw.replace(/<head>[\s\S]*?<\/head>/, '').replace(/<(script|style)[\s\S]*?<\/\1>/g, '')
  const out: string[] = [], spans: boolean[] = []
  const lists: { level: number; n: number; f: { pre: string; style: string | null; post: string } | null }[] = []
  // open list items (true while its markup is still open); an article heading closes them all so
  // each article's HTML is complete on its own
  const items: boolean[] = []
  let i = 0
  for (const m of body.matchAll(/<(\/?)([a-zA-Z0-9]+)([^>]*)>/g)) {
    out.push(body.slice(i, m.index)); i = m.index! + m[0].length
    const [, close, tag0, attrs] = m, tag = tag0.toLowerCase()
    if (tag === 'h1' && !close) for (let k = 0; k < items.length; k++) if (items[k]) { out.push('</div></div>'); items[k] = false }
    if (tag === 'span') {
      if (close) { if (spans.pop()) out.push('</b>') }
      else { const cls = /class="([^"]*)"/.exec(attrs)?.[1] ?? ''; const b = cls.split(/\s+/).some(c => css.has(c)); spans.push(b); if (b) out.push('<b>') }
    } else if (tag === 'ol' || tag === 'ul') {
      if (close) { lists.pop(); continue }
      const k = /(lst-kix_[a-z0-9]+-(\d+))/.exec(attrs)
      const start = +(/start="(\d+)"/.exec(attrs)?.[1] ?? 1)
      lists.push({ level: k ? +k[2] : 0, n: start - 1, f: k ? fmt[k[1]] ?? null : null })
    } else if (tag === 'li') {
      const L = lists[lists.length - 1]
      if (!L) continue
      if (close) { if (items.pop()) out.push('</div></div>'); continue }
      L.n++; items.push(true)
      const mk = L.f?.style ? `${L.f.pre}${counter(L.n, L.f.style)}${L.f.post}`.trim() : '•'
      out.push(`<div class="cl" style="padding-left:${(L.level * 1.4).toFixed(1)}rem"><span class="cm">${mk}</span><div>`)
    } else if (KEEP.has(tag)) out.push(tag === 'br' ? '<br>' : `<${close}${tag}>`)
  }
  out.push(body.slice(i))
  return out.join('').replace(/&nbsp;| /g, ' ').replace(/<p>\s*<\/p>/g, '').replace(/<(h\d)>\s*<\/\1>/g, '').replace(/<b>\s*<\/b>/g, '')
}
const ENT: Record<string, string> = { amp: '&', quot: '"', apos: "'", '#39': "'", rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', mdash: '—', ndash: '–', hellip: '…', sect: '§', frac23: '⅔', frac34: '¾' }
const text = (h: string) => h.replace(/<[^>]+>/g, '').replace(/&(#?\w+);/g, (m, e) => ENT[e] ?? (e.startsWith('#') ? String.fromCharCode(Number(e.slice(1))) : m)).replace(/\s+/g, ' ').trim()

export async function loadConstitution(): Promise<{ articles: Article[]; resolutions: Resolution[] } | null> {
  let raw: string
  try {
    const r = await fetch(`https://docs.google.com/document/d/${DOC_ID}/export?format=html`, { next: { revalidate: 3600 } })
    if (!r.ok) return null
    raw = await r.text()
  } catch { return null }
  const s = clean(raw)
  // the articles are the doc's h1 sections up to "Code of Conduct"; the rules section follows
  const parts = s.split(/(<h1>[\s\S]*?<\/h1>)/)
  const articles: Article[] = []
  let restStart = parts.length
  for (let i = 1; i < parts.length; i += 2) {
    const title = text(parts[i])
    if (/^(Comm\.|Fed\.)/.test(title) || !title) { restStart = i; break }
    articles.push({ title, html: parts[i + 1] ?? '' })
    if (/code of conduct/i.test(title)) { restStart = i + 2; break }
  }
  // resolutions: every block that starts with a "Comm./Fed. Res./Directive/Notice N —" title, in order
  let rest = parts.slice(restStart).join('')
  rest = rest.split(/<p>(?:<b>)?\s*yoy Sports Federation Code of Conduct/i)[0]
  const blocks = rest.split(/(?=<(?:h\d|p)>(?:<b>)?\s*(?:Comm\.|Fed\.)\s*(?:Res\.|Directive|Notice)\s*[IVXL]+\b)/)
  const resolutions: Resolution[] = []
  for (const b of blocks) {
    const m = /^<(h\d|p)>([\s\S]*?)<\/\1>/.exec(b.trim())
    if (!m) continue
    const title = text(m[2]); if (!/^(Comm\.|Fed\.)/.test(title)) continue
    const html = b.trim().slice(m[0].length).replace(/<p>\s*\[\d+\][\s\S]*$/, '')
    const t = text(html)
    const kind: Resolution['kind'] = /Directive/.test(title) ? 'directive' : /Notice/.test(title) ? 'notice' : 'resolution'
    const status: Resolution['status'] = kind !== 'resolution' ? 'Issued'
      : /failing|not in favor|fail(s|ed) to/i.test(t) ? 'Failed'
      : /votes\s*\d+\s*[-–]\s*\d+\s*in favor|Enacted (on )?[A-Z][a-z]+ \d/.test(t) ? 'Passed' : 'Vote not recorded'
    resolutions.push({ title: title.replace(/\s*[—-]\s+/, ' — ').replace(/\s*\(/, ' ('), kind, status, html, date: docDate(t) })
  }
  return { articles, resolutions: withPortal(resolutions) }
}

// ── ySF Portal proposals (members-only; snapshot in data/ysf-proposals.json) ─────────────────
// The portal records each vote; it overrides the document's outcome and carries resolutions the
// document doesn't have yet.
import fs from 'fs'
import path from 'path'
// git-ignored runtime data like the database; refreshed from the portal in the owner's signed-in browser
const portalRecords = (): PortalRec[] => { try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'ysf-proposals.json'), 'utf8')) } catch { return [] } }
type PortalRec = { id: number; title: string; badges: string[]; meta: string; body: string; tally: string | null; votes: string[][] }
const OWNER_CLUB: Record<string, string> = {
  'Abraham Mitchel': 'Mitchel B.J.C.', 'Aidan Waltemeyer': 'Waltemeyer United', 'Benjamin Schoenfeld': 'Benfica A.S.C.', 'Daniel Ogden': 'Ogden-upon-York S.C.',
  'Dylan Ferrante': 'A.C. Ferrante', 'Gabriel Shatunovsky': 'Real Meir C.K.', 'Jack Allaman': 'Allaman A.C.', 'Jacob Wilsey': 'Wilsey Warriors F.C.',
  'Justin Kremer': 'Kreme Machine United', 'Natalie Ogden': 'Inter Nat S.C.', 'Neal Saste': 'Saste Snipers United', 'Robert Clinkscale': 'Real Clink', 'Robert Clinkscale IV': 'Real Clink',
}
const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December'
const ABBR: Record<string, string> = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' }
function docDate(t: string): string | undefined {
  const m = new RegExp(`(?:Proposed|Announced|conducted)\\s+(${MONTHS}) (\\d{1,2}),? (\\d{4})`).exec(t)
  return m ? `${m[3]}-${ABBR[m[1].slice(0, 3)]}-${m[2].padStart(2, '0')}` : undefined
}
const resKey = (t: string) => /^(Comm\.|Fed\.)\s*(Res\.|Directive|Notice)\s*([IVXL]+)\b/.exec(t)?.slice(1).join(' ') ?? t
function fromPortal(p: PortalRec): Partial<Resolution> {
  const st = p.badges.find(b => /Passed|Failed|Open/.test(b)) as 'Passed' | 'Failed' | 'Open' | undefined
  const d = /· (\w{3}) (\d{1,2}), (\d{4})/.exec(p.meta)
  return {
    status: st ?? 'Vote not recorded', text: p.body, type: p.badges.find(b => /Rule|Amendment/.test(b)), emergency: p.badges.includes('Emergency'),
    tally: p.tally ?? undefined, votes: p.votes.filter(v => v.length >= 2).map(([o, v]) => ({ owner: o, club: OWNER_CLUB[o] ?? null, vote: v })),
    date: d ? `${d[3]}-${ABBR[d[1]]}-${d[2].padStart(2, '0')}` : undefined,
  }
}
function withPortal(docRes: Resolution[]): Resolution[] {
  const portal = portalRecords()
  const used = new Set<number>()
  const out = docRes.map(r => {
    const p = portal.find(x => resKey(x.title) === resKey(r.title))
    if (!p) return r
    used.add(p.id)
    return { ...r, ...fromPortal(p), date: fromPortal(p).date ?? r.date }
  })
  for (const p of portal) if (!used.has(p.id))
    out.push({ title: p.title.replace(/\s*[:—-]\s+/, ' — '), kind: 'resolution', html: '', status: 'Vote not recorded', ...fromPortal(p) } as Resolution)
  // undated items keep their place in the document; open proposals first, then oldest to newest
  for (let i = 1; i < out.length; i++) if (!out[i].date) out[i].date = out[i - 1].date
  return out.map((r, i) => ({ r, i })).sort((a, b) => (a.r.status === 'Open' ? 0 : 1) - (b.r.status === 'Open' ? 0 : 1) || (a.r.date ?? '').localeCompare(b.r.date ?? '') || a.i - b.i).map(x => x.r)
}
