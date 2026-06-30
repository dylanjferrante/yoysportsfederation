import React from 'react'

// Minimal, SAFE markdown renderer — builds React elements (never
// dangerouslySetInnerHTML), so there's no XSS surface. Supports headings (#/##/###),
// bullet lists (- / *), bold (**x**), italic (*x*), inline code (`x`), and links.

function inline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  // Order matters: links, bold, code, italic.
  const re = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))|(\*\*([^*]+)\*\*)|(`([^`]+)`)|(\*([^*]+)\*)/g
  let last = 0, m: RegExpExecArray | null, i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const key = `${keyBase}-${i++}`
    if (m[1]) out.push(<a key={key} href={m[3]} target="_blank" rel="noreferrer" className="text-blue-600 underline">{m[2]}</a>)
    else if (m[4]) out.push(<strong key={key}>{m[5]}</strong>)
    else if (m[6]) out.push(<code key={key} className="px-1 py-0.5 rounded bg-slate-100 text-slate-700 text-[0.85em]">{m[7]}</code>)
    else if (m[8]) out.push(<em key={key}>{m[9]}</em>)
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

export default function Markdown({ text, className = '' }: { text: string; className?: string }) {
  const lines = (text ?? '').replace(/\r\n/g, '\n').split('\n')
  const blocks: React.ReactNode[] = []
  let list: string[] = []
  let para: string[] = []
  const flushList = () => {
    if (!list.length) return
    blocks.push(<ul key={`ul-${blocks.length}`} className="list-disc pl-5 my-2 space-y-1">{list.map((li, i) => <li key={i}>{inline(li, `li-${blocks.length}-${i}`)}</li>)}</ul>)
    list = []
  }
  const flushPara = () => {
    if (!para.length) return
    blocks.push(<p key={`p-${blocks.length}`} className="my-2 leading-relaxed">{para.flatMap((ln, i) => [...inline(ln, `p-${blocks.length}-${i}`), i < para.length - 1 ? <br key={`br${i}`} /> : null])}</p>)
    para = []
  }
  for (const raw of lines) {
    const line = raw.trimEnd()
    if (/^###\s+/.test(line)) { flushList(); flushPara(); blocks.push(<h4 key={blocks.length} className="font-semibold text-slate-800 mt-4 mb-1">{inline(line.replace(/^###\s+/, ''), `h4-${blocks.length}`)}</h4>) }
    else if (/^##\s+/.test(line)) { flushList(); flushPara(); blocks.push(<h3 key={blocks.length} className="font-bold text-slate-900 mt-5 mb-1 text-lg">{inline(line.replace(/^##\s+/, ''), `h3-${blocks.length}`)}</h3>) }
    else if (/^#\s+/.test(line)) { flushList(); flushPara(); blocks.push(<h2 key={blocks.length} className="font-bold text-slate-900 mt-5 mb-2 text-xl">{inline(line.replace(/^#\s+/, ''), `h2-${blocks.length}`)}</h2>) }
    else if (/^[-*]\s+/.test(line)) { flushPara(); list.push(line.replace(/^[-*]\s+/, '')) }
    else if (line === '') { flushList(); flushPara() }
    else { flushList(); para.push(line) }
  }
  flushList(); flushPara()
  return <div className={`text-sm text-slate-700 ${className}`}>{blocks}</div>
}
