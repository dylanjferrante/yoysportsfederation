// Pure helpers for the legacy-history importer. Kept free of DB/IO so the
// club-resolution logic (which names get matched vs. created) is unit-testable.

export type ImportClub = { name: string; abbreviation?: string; ownerName?: string; ownerEmail?: string }
export type ImportRecord = { club: string; sport: string }
export type ImportChampion = { scope: string; champion: string; runnerUp?: string }
export type ImportSeason = { season: string; records?: ImportRecord[]; champions?: ImportChampion[] }
export type ImportDoc = { clubs?: ImportClub[]; seasons: ImportSeason[] }

// Every distinct club name referenced anywhere in the document (clubs list,
// records, champions and runners-up), trimmed and de-duplicated by identity.
export function collectClubNames(doc: ImportDoc): string[] {
  const seen = new Set<string>()
  const add = (n?: string) => { const t = (n ?? '').trim(); if (t) seen.add(t) }
  for (const c of doc.clubs ?? []) add(c.name)
  for (const s of doc.seasons ?? []) {
    for (const r of s.records ?? []) add(r.club)
    for (const c of s.champions ?? []) { add(c.champion); add(c.runnerUp) }
  }
  return [...seen]
}

// Split referenced names into those that match an existing club (case-insensitive)
// and those that must be created. existingNames is the set of current club names.
export function planClubResolution(referenced: string[], existingNames: Iterable<string>): { matched: string[]; toCreate: string[] } {
  const have = new Set([...existingNames].map(n => n.trim().toLowerCase()))
  const matched: string[] = []
  const toCreate: string[] = []
  for (const name of referenced) (have.has(name.trim().toLowerCase()) ? matched : toCreate).push(name)
  return { matched, toCreate }
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'club'

// Deterministic placeholder email for a created historical club, unique within
// the supplied set of already-used emails.
export function legacyEmail(name: string, leagueId: string, used: Set<string>): string {
  const base = `legacy+${slug(name)}-${leagueId.slice(0, 6)}@nexus.local`
  if (!used.has(base)) return base
  let n = 1
  let candidate = `legacy+${slug(name)}-${leagueId.slice(0, 6)}-${n}@nexus.local`
  while (used.has(candidate)) { n++; candidate = `legacy+${slug(name)}-${leagueId.slice(0, 6)}-${n}@nexus.local` }
  return candidate
}

export function abbrFor(name: string, given?: string): string {
  return (given || name.replace(/[^A-Za-z0-9]/g, '').slice(0, 4) || 'LEG').toUpperCase()
}
