// The official ySF Constitution & Bylaws, read live from its Google Doc (public HTML export) and
// split into articles and resolutions — full text, as written, with each resolution's outcome.
// Output HTML keeps only structural tags (no attributes), so it is safe to render.
const DOC_ID = '11aq9kXeGiEYDE4FjLkpUm-7umKq-TiwvQnAb-lpUMfA'
const KEEP = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'li', 'table', 'tbody', 'tr', 'td', 'th', 'br'])

export type Article = { title: string; html: string }
export type Resolution = { title: string; kind: 'directive' | 'resolution' | 'notice'; status: 'Passed' | 'Failed' | 'Vote not recorded' | 'Issued'; html: string }
export const DOC_URL = `https://docs.google.com/document/d/${DOC_ID}/edit`

function clean(raw: string): string {
  const css = new Set<string>()
  const st = /<style type="text\/css">([\s\S]*?)<\/style>/.exec(raw)?.[1] ?? ''
  for (const m of st.matchAll(/\.(c\d+)\{([^}]*)\}/g)) if (m[2].includes('font-weight:700')) css.add(m[1])
  const body = raw.replace(/<head>[\s\S]*?<\/head>/, '').replace(/<(script|style)[\s\S]*?<\/\1>/g, '')
  const out: string[] = [], spans: boolean[] = []
  let i = 0
  for (const m of body.matchAll(/<(\/?)([a-zA-Z0-9]+)([^>]*)>/g)) {
    out.push(body.slice(i, m.index)); i = m.index! + m[0].length
    const [, close, tag0, attrs] = m, tag = tag0.toLowerCase()
    if (tag === 'span') {
      if (close) { if (spans.pop()) out.push('</b>') }
      else { const cls = /class="([^"]*)"/.exec(attrs)?.[1] ?? ''; const b = cls.split(/\s+/).some(c => css.has(c)); spans.push(b); if (b) out.push('<b>') }
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
    // confirmed in force by the Commission though the document has no vote recorded (2026-11-12)
    const inForce = /^(Comm\. Res\. VII|Fed\. Res\. III)\b/.test(title) && status === 'Vote not recorded'
    resolutions.push({ title: title.replace(/\s*[—-]\s+/, ' — ').replace(/\s*\(/, ' ('), kind, status: inForce ? 'Passed' : status, html })
  }
  return { articles, resolutions }
}
