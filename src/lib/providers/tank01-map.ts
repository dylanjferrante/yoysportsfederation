// ── Tank01 stat-field → our scoring-key mapping ──────────────────────────────
// Tank01 returns RAW stat projections (yards, TDs, receptions…), nested under
// groups. We flatten them onto our scoring-category keys (see DEFAULT_SCORING)
// so each league can apply its OWN scoring settings to the same raw stats.
//
// Only the four major sports are covered; fields are filled in per sport as we
// confirm each one's projection shape via the probe.

const n = (v: unknown): number => {
  const x = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : 0
  return Number.isFinite(x) ? x : 0
}

/** NFL: flatten Tank01 playerProjections entry → { ourScoringKey: value }. */
function mapNFL(raw: any): Record<string, number> {
  const p = raw.Passing ?? {}
  const r = raw.Rushing ?? {}
  const rec = raw.Receiving ?? {}
  return {
    passingYards: n(p.passYds),
    passingTD: n(p.passTD),
    passingInt: n(p.int),
    passingCompletions: n(p.passCompletions),
    passingAttempts: n(p.passAttempts),
    rushingYards: n(r.rushYds),
    rushingTD: n(r.rushTD),
    rushingAttempts: n(r.carries),
    receivingYards: n(rec.recYds),
    receivingTD: n(rec.recTD),
    receptions: n(rec.receptions),
    targets: n(rec.targets),
    fumbleLost: n(raw.fumblesLost),
    // Tank01 gives a single combined two-point figure; attribute to rushing 2pt
    // (rare enough that the split barely moves projected points).
    rushing2pt: n(raw.twoPointConversion),
  }
}

/** NFL team-defense (DST) projection → our defensive scoring keys. */
export function mapNFLDefense(raw: any): Record<string, number> {
  return {
    sack: n(raw.sacks),
    interception: n(raw.interceptions),
    fumbleRecovery: n(raw.fumbleRecoveries),
    defensiveTD: n(raw.defTD),
    returnTD: n(raw.returnTD),
    safety: n(raw.safeties),
    blockedKick: n(raw.blockKick),
    pointsAllowed: n(raw.ptsAgainst),
  }
}

const MAPPERS: Record<string, (raw: any) => Record<string, number>> = {
  NFL: mapNFL,
  // NBA / NHL / MLB filled in once their projection shapes are confirmed.
}

/** Flatten a provider projection's raw stats to our scoring keys for a sport. */
export function toScoringStats(sport: string, raw: any): Record<string, number> {
  const fn = MAPPERS[sport]
  if (fn) return fn(raw)
  // Fallback: shallow-copy numeric fields so nothing is lost before mapping exists.
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(raw ?? {})) if (typeof v === 'string' || typeof v === 'number') out[k] = n(v)
  return out
}

/** Apply a league's scoring settings to a flat stat map → fantasy points. */
export function applyScoring(scoring: Record<string, number>, stats: Record<string, number>): number {
  let pts = 0
  for (const [key, weight] of Object.entries(scoring)) pts += (stats[key] ?? 0) * weight
  return Math.round(pts * 100) / 100
}
