'use client'
// Every table on the site sorts by its column headers: click a header to sort by that column
// (numbers as numbers, — last), click again to reverse. Works on any page, including tables that
// appear later (tabs, client-loaded data). Left alone: tables marked data-nosort, headers that already
// hold their own link or button (server-sorted tables), and table bodies with grouped rows (a row that
// spans columns, e.g. "STARTERS" or a date heading), where sorting would scramble the groups.
import { useEffect } from 'react'

const parse = (s: string): number | string | null => {
  const t = s.replace(/\s+/g, ' ').trim()
  if (!t || /^[—–-]$/.test(t)) return null
  const n = t.replace(/[$,%+]/g, '').replace(/^[<>]/, '')
  if (/^-?\d+(\.\d+)?$/.test(n)) return parseFloat(n)
  const ord = /^(\d+)(st|nd|rd|th)$/i.exec(t)
  if (ord) return +ord[1]
  return t.toLowerCase()
}

function headerCells(table: HTMLTableElement): HTMLTableCellElement[] {
  const rows = table.tHead?.rows
  if (!rows || !rows.length) return []
  return [...rows[rows.length - 1].cells] as HTMLTableCellElement[]
}

function sortable(table: HTMLTableElement, cols: number): boolean {
  if (table.dataset.nosort !== undefined) return false
  for (const tb of table.tBodies) for (const r of tb.rows) {
    if (r.cells.length !== cols) return false
    for (const c of r.cells) if (c.colSpan > 1) return false
  }
  return table.tBodies.length > 0 && [...table.tBodies].some(tb => tb.rows.length > 1)
}

function sortBy(table: HTMLTableElement, col: number, th: HTMLTableCellElement) {
  const dir = th.dataset.sortDir === 'desc' ? 'asc' : 'desc'
  for (const h of headerCells(table)) { delete h.dataset.sortDir; h.removeAttribute('aria-sort') }
  th.dataset.sortDir = dir
  th.setAttribute('aria-sort', dir === 'asc' ? 'ascending' : 'descending')
  for (const tb of table.tBodies) {
    const rows = [...tb.rows]
    rows.sort((a, b) => {
      const x = parse(a.cells[col]?.textContent ?? ''), y = parse(b.cells[col]?.textContent ?? '')
      if (x === null && y === null) return 0
      if (x === null) return 1
      if (y === null) return -1
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))
      return dir === 'asc' ? c : -c
    })
    for (const r of rows) tb.appendChild(r)
  }
}

function enhance(root: ParentNode) {
  for (const table of root.querySelectorAll<HTMLTableElement>('main table')) {
    if (table.dataset.sortReady) continue
    const ths = headerCells(table)
    if (!ths.length || !sortable(table, ths.length)) continue
    table.dataset.sortReady = '1'
    ths.forEach((th, i) => {
      if (!th.textContent?.trim() || th.querySelector('a, button')) return
      th.classList.add('ysf-sortable')
      th.tabIndex = 0
      th.addEventListener('click', () => sortBy(table, i, th))
      th.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sortBy(table, i, th) } })
    })
  }
}

export default function SortableTables() {
  useEffect(() => {
    enhance(document)
    let t: ReturnType<typeof setTimeout> | null = null
    const mo = new MutationObserver(() => { if (t) clearTimeout(t); t = setTimeout(() => enhance(document), 150) })
    mo.observe(document.body, { childList: true, subtree: true })
    return () => { mo.disconnect(); if (t) clearTimeout(t) }
  }, [])
  return null
}
