// ySF News: daily stories written as the week unfolds, in the voices of four Federation sportswriters,
// from a fact sheet built out of the league's own data (standings, this week's scores, top performances,
// moves, trades). Written by Claude when ANTHROPIC_API_KEY is set; without it nothing new is written and
// the page shows what is already stored. The scheduler calls writeDueNews() every hour; each story has a
// slot key (one daily wrap a day, one column a day, one piece per completed trade) so nothing doubles up.
import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { sql, eq } from 'drizzle-orm'
import { db } from '@/db'
import { leagues } from '@/db/schema'
import { YSF_LEAGUE_ID, YSF_LEAGUES } from '@/lib/ysf'
import { loadStandings, loadWeek, loadMoves, siteCupProjection } from '@/lib/ysf-data'
import { buildDesk, deskStories, addDay, type Story } from '@/lib/ysf-wire'

// ── the writers ─────────────────────────────────────────────────────────────
export type Writer = { id: string; name: string; title: string; style: string }
export const WRITERS: Record<string, Writer> = {
  walt: {
    id: 'walt', name: 'Walt Brennan', title: 'Senior Writer',
    style: `You write long-form features in the tradition of Sports Illustrated's golden age. Open with a scene or an image, not a statistic. Long, rhythmic sentences balanced by short ones that land. Reach for history and literature now and then, never showily. You find the human story inside the standings — the patient rebuild, the club that won't go away, the season turning on a single week. Measured, warm, a little romantic about sport. End on a line that lingers.`,
  },
  rico: {
    id: 'rico', name: 'Rico Delgado', title: 'Columnist',
    style: `You write the funny, conversational column readers went looking for on ESPN.com's Page 2 around 2002. Talk straight to the reader. Short paragraphs, a lot of one-liners, parenthetical asides, the occasional numbered list, pop-culture comparisons (movies, music, TV — keep it broad and dated to taste, nothing cruel). Strong takes you only half believe, owned with a wink. Rib the clubs good-naturedly; never mean-spirited about the owners.`,
  },
  june: {
    id: 'june', name: 'June Okafor', title: 'Senior Analyst',
    style: `You are the numbers writer, the ESPN Insider of the Federation. Lead with the stat that matters. Crisp, declarative sentences. Explain what the Cup projection says and why, quantify everything you can from the fact sheet, compare clubs side by side, and be openly skeptical of narratives the numbers don't support. Plain words over jargon; one clear takeaway per section.`,
  },
  hank: {
    id: 'hank', name: 'Hank Sorensen', title: 'League Reporter',
    style: `You are the wire-service beat reporter. Inverted pyramid: the most important result in the first sentence, then the next most important, and so on. Who, what, when, by how much. Tight one- or two-sentence paragraphs. No opinions, no adjectives you can't back with a number. Clean, quick, accurate — the account of record.`,
  },
}

const RULES = `House rules for every story:
- Use ONLY facts in the fact sheet. Never invent scores, statistics, injuries, trades, history, or quotes. Do not quote anyone; the owners are real people.
- Club names exactly as given (full name on first mention, abbreviation after). League names exactly: ySFFL (football), ySFHL (hockey), ySFBA (basketball), ySFLB (baseball), always with a lowercase y. "The Federation", "the Cup" (Federation Cup).
- Players on first mention: "First Last (ySFxx-TEAM, POS)", e.g. "Chris Olave (ySFFL-NO, WR)"; last name after.
- American English. Dates include the year. Numbers as given (keep decimals as given).
- Write for fans who know the league; no explanations of how fantasy sports work.
- A headline (no more than 12 words, no clickbait), a one-sentence dek, then the body as paragraphs.
- List the abbreviations of the clubs the story is mainly about in "clubs" (at most four).`

const ArticleSchema = z.object({
  headline: z.string(),
  dek: z.string(),
  body: z.array(z.string()),
  clubs: z.array(z.string()),
})
export type Article = z.infer<typeof ArticleSchema> & { id: string; kind: string; writer: string; published: string; slot: string; sport: string | null }

// ── storage ─────────────────────────────────────────────────────────────────
export function ensureNewsSchema() {
  db.run(sql`CREATE TABLE IF NOT EXISTS ysf_news (id TEXT PRIMARY KEY, slot TEXT NOT NULL UNIQUE, season TEXT NOT NULL, kind TEXT NOT NULL, writer TEXT NOT NULL,
    sport TEXT, headline TEXT NOT NULL, dek TEXT NOT NULL, body TEXT NOT NULL, clubs TEXT NOT NULL, published TEXT NOT NULL)`)
}
export function listNews(limit = 60): Article[] {
  ensureNewsSchema()
  return db.all<any>(sql`SELECT * FROM ysf_news ORDER BY published DESC LIMIT ${limit}`).map(r => ({ ...r, body: JSON.parse(r.body), clubs: JSON.parse(r.clubs) }))
}
export function getNews(id: string): Article | null {
  ensureNewsSchema()
  const r = db.all<any>(sql`SELECT * FROM ysf_news WHERE id = ${id}`)[0]
  return r ? { ...r, body: JSON.parse(r.body), clubs: JSON.parse(r.clubs) } : null
}

// ── the fact sheet ──────────────────────────────────────────────────────────
const etDate = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d)
const etLong = (d: Date) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(d)

export async function factSheet(now = new Date()) {
  const [league] = await db.select().from(leagues).where(eq(leagues.id, YSF_LEAGUE_ID)).limit(1)
  const s = await loadStandings(league)
  const C = s.clubs, name = (id: string) => C[id] ? `${C[id].name} (${C[id].abbreviation})` : id
  const code = (sp: string) => YSF_LEAGUES.find(l => l.sport === sp)?.code ?? sp
  const wk = await loadWeek(league)
  const { moves, trades } = await loadMoves(league.id, league.season)
  const cup = await siteCupProjection().catch(() => null)
  const yesterday = etDate(new Date(now.getTime() - 86_400_000))
  // the best fantasy performances yesterday (daily leagues) and in the latest ySFFL week
  const perf = db.all<{ sport: string; name: string; pro_team: string | null; positions: string | null; pts: number; team_id: string; date: string | null; started: string }>(sql`
    SELECT sport, name, pro_team, positions, COALESCE(engine_pts, fpts) pts, team_id, date, status started FROM fantrax_player_periods
    WHERE season = ${league.season} AND ((date = ${yesterday}) OR (sport = 'NFL' AND matchup_period = (SELECT MAX(matchup_period) FROM fantrax_player_periods WHERE season = ${league.season} AND sport = 'NFL' AND engine_pts IS NOT NULL)))
    ORDER BY pts DESC LIMIT 14`)
  const recentMoves = moves.filter(m => m.season === league.season && Date.parse(m.when) >= now.getTime() - 2 * 86_400_000).slice(0, 25)
  return {
    today: etLong(now),
    season: league.season,
    federationCup: s.cup.map(r => ({ rank: r.rk, club: name(r.teamId), cupPoints: r.pts, record: r.rec, chanceToWinCup: `${(r.cupPct * 100).toFixed(1)}%`, projectedCupPoints: +r.exp.toFixed(1),
      leagueRanks: Object.fromEntries(Object.entries(r.ranks).filter(([, v]) => v != null).map(([k, v]) => [code(k), v])) })),
    cupModelUpdated: cup?.generated_at ?? null,
    leagueStandings: Object.fromEntries(s.live.map(sp => [code(sp), (s.tables[sp] ?? []).map(r => ({ rank: r.rk, club: name(r.teamId), record: r.rec, gamesBack: r.gb, pointsFor: +r.pf.toFixed(1) }))])),
    thisWeek: wk.pairings.map(p => ({ clubs: [name(p.a), name(p.b)], matchups: p.lines.map(l => ({ league: code(l.sport), period: l.label, status: l.status, score: l.a == null ? null : `${l.a.toFixed(1)}–${(l.b ?? 0).toFixed(1)}` })) })),
    topPerformances: perf.filter(p => p.pts > 0).map(p => ({ player: `${p.name} (${code(p.sport)}-${p.pro_team ?? 'FA'}, ${(p.positions ?? '').replace(/,/g, '/')})`, club: name(p.team_id), fantasyPoints: p.pts, when: p.date ?? 'latest ySFFL week', inLineup: p.started === '1' })),
    recentMoves: recentMoves.map(m => ({ when: m.when.slice(0, 10), club: name(m.teamId), move: m.kind, player: m.player ? `${m.player} (${code(m.sport)}-${m.team || 'FA'}, ${m.pos})` : m.text, bid: m.bid })),
    recentTrades: trades.filter(t => t.season === league.season && Date.parse(t.when) >= now.getTime() - 7 * 86_400_000).slice(0, 6)
      .map(t => ({ when: t.when.slice(0, 10), sides: t.sides.map(sd => ({ club: name(sd.teamId), gets: sd.gets.map(g => g.name ? `${g.name} (${code(g.sport)}-${g.team || 'FA'}, ${g.pos})` : '') .filter(Boolean) })), summary: t.text })),
    recentHeadlines: listNews(12).map(a => `${a.published.slice(0, 10)} · ${WRITERS[a.writer]?.name}: ${a.headline}`),
  }
}

// ── what gets written when ─────────────────────────────────────────────────
type Assignment = { slot: string; kind: string; writer: string; brief: string; words: string }
const COLUMN_BY_DAY: Record<number, Omit<Assignment, 'slot'>> = {
  1: { kind: 'feature', writer: 'walt', words: '800–1,100', brief: 'The weekend in the Federation: the one story that matters most right now, told as a feature.' },
  2: { kind: 'column', writer: 'rico', words: '600–850', brief: 'Your Tuesday column: the week so far across the Federation, the races, the clubs that deserve a ribbing or a medal.' },
}

export function dueAssignments(facts: Awaited<ReturnType<typeof factSheet>>, now = new Date()): Assignment[] {
  ensureNewsSchema()
  const have = new Set(db.all<{ slot: string }>(sql`SELECT slot FROM ysf_news`).map(r => r.slot))
  const day = etDate(now), hourEt = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }).format(now))
  const dow = new Date(day + 'T12:00:00Z').getUTCDay()
  const out: Assignment[] = []
  // the daily wrap, mornings, when anything was played yesterday
  if (hourEt >= 7 && facts.topPerformances.length) out.push({ slot: `daily:${day}`, kind: 'daily', writer: 'hank', words: '250–400', brief: "The daily wrap: yesterday's results and standout performances across the leagues, and where each race stands this morning." })
  // the day's column, from late morning
  const col = COLUMN_BY_DAY[dow]
  if (col && hourEt >= 11) out.push({ slot: `col:${day}`, ...col })
  // every trade completed in the last day gets its own story
  for (const t of facts.recentTrades) {
    const key = `trade:${t.when}:${t.sides.map(sd => sd.club).sort().join('|')}`
    if (Date.parse(t.when) >= now.getTime() - 86_400_000) out.push({ slot: key, kind: 'trade', writer: 'hank', words: '150–250', brief: `Breaking: the trade between ${t.sides.map(sd => sd.club).join(' and ')}. Who got what, and what it changes.` })
  }
  return out.filter(a => !have.has(a.slot))
}

// ── writing ─────────────────────────────────────────────────────────────────
export const newsConfigured = () => !!process.env.ANTHROPIC_API_KEY

export async function writeArticle(a: Assignment & { sport?: string | null }, facts: Awaited<ReturnType<typeof factSheet>>): Promise<Article> {
  const w = WRITERS[a.writer]
  const client = new Anthropic()
  const response = await client.beta.messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    // the writer's voice and the house rules are the same on every call, so they're cached
    system: [{ type: 'text', text: `You are ${w.name}, ${w.title} at ySF News, covering the yoy Sports Federation (twelve clubs competing across four fantasy leagues — football, hockey, basketball and baseball — for the Federation Cup).\n\n${w.style}\n\n${RULES}`, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `Assignment (${a.kind}, ${a.words} words): ${a.brief}\n\nToday is ${facts.today}. Avoid repeating the angles in recentHeadlines.\n\nFact sheet (JSON):\n${JSON.stringify(facts)}` }],
    output_config: { effort: 'medium', format: betaZodOutputFormat(ArticleSchema) },
  })
  if (response.stop_reason === 'refusal' || !response.parsed_output) throw new Error(`no article (${response.stop_reason})`)
  const p = response.parsed_output
  const art: Article = { ...p, id: nanoid(10), kind: a.kind, writer: a.writer, published: new Date().toISOString(), slot: a.slot, sport: a.sport ?? null }
  db.run(sql`INSERT OR IGNORE INTO ysf_news (id, slot, season, kind, writer, sport, headline, dek, body, clubs, published)
    VALUES (${art.id}, ${art.slot}, ${facts.season}, ${art.kind}, ${art.writer}, ${art.sport}, ${art.headline}, ${art.dek}, ${JSON.stringify(art.body)}, ${JSON.stringify(art.clubs)}, ${art.published})`)
  return art
}

// store a desk story as written
function storeStory(st: Story, season: string, published: string) {
  db.run(sql`INSERT OR IGNORE INTO ysf_news (id, slot, season, kind, writer, sport, headline, dek, body, clubs, published)
    VALUES (${nanoid(10)}, ${st.slot}, ${season}, ${st.kind}, ${st.writer}, ${st.sport}, ${st.headline}, ${st.dek}, ${JSON.stringify(st.body)}, ${JSON.stringify(st.clubs)}, ${published})`)
}
const etAt = (day: string, hour: number, min = 0) => { const guess = new Date(`${day}T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:00Z`); const off = new Date(guess.toLocaleString('en-US', { timeZone: 'America/New_York' })).getTime() - new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' })).getTime(); return new Date(guess.getTime() - off).toISOString() }
// who writes each desk story when the staff writers are on (an API key is set)
const WRITER_FOR = (st: Story) => ({ analysis: 'june', preview: 'june', recap: 'walt', rankings: 'rico', wire: 'hank', move: 'hank', trade: 'hank', daily: 'hank' } as Record<string, string>)[st.kind]
  ?? (st.kind === 'notebook' ? (st.sport === 'NFL' || st.sport === 'NBA' ? 'rico' : 'walt') : 'hank')
// what each kind of story is, for the writer
const BRIEF: Record<string, { words: string; what: string }> = {
  daily: { words: '400–600', what: "The Daily: yesterday across the Federation — the standout performances, the races that moved, where every league stands this morning." },
  recap: { words: '500–750', what: 'Recap: the week just finished in this league — the result that mattered most told in full, every other result, the best performances, and what the table looks like now.' },
  preview: { words: '450–650', what: "This Week: the league's matchups ahead — the game of the week in depth, every other matchup, the model's odds, the players to watch, and what's at stake in the table." },
  wire: { words: '400–600', what: "On the Wire: the league's week of claims, signings and releases — the biggest bids and why they matter to those clubs, who got cut and their history, and who still has FAAB to spend." },
  notebook: { words: '400–600', what: 'Notebook: a midweek check-in on the league — the races in progress, standout performances, streaks, the playoff line.' },
  rankings: { words: '600–850', what: 'Power Rankings: all twelve clubs ranked, a short paragraph each — record, scoring, the model, how they got here, with personality.' },
  move: { words: '300–450', what: 'A transaction story: what the move means for the club — the player, how he ranks, where he fits in the lineup, what it cost; for a release, his history with the club and what they lose.' },
  trade: { words: '350–550', what: 'A trade story: who got what, how each piece ranks and fits, the points per game moving each way, and who comes out ahead on the numbers so far.' },
  analysis: { words: '500–700', what: 'The Cup race: the standings, both projections, each contender and its paths.' },
}

// Today's stories, once each is due (from 7 AM ET): the desk's daily wrap, league notebooks, Cup update,
// moves and trades — rewritten by the staff writers when an API key is set — plus the day's column.
export async function writeDueNews(now = new Date()): Promise<string[]> {
  ensureNewsSchema()
  const [league] = await db.select().from(leagues).where(eq(leagues.id, YSF_LEAGUE_ID)).limit(1)
  const day = etDate(now), hourEt = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }).format(now))
  if (hourEt < 7) return []
  const have = new Set(db.all<{ slot: string }>(sql`SELECT slot FROM ysf_news`).map(r => r.slot))
  const stories = deskStories(await buildDesk(league, day, true)).filter(st => !have.has(st.slot))
  const done: string[] = []
  const facts = newsConfigured() ? await factSheet(now) : null
  let budget = 6
  for (const st of stories) {
    if (facts && budget > 0) {
      budget--
      try {
        const b = BRIEF[st.kind] ?? { words: '400–600', what: st.dek }
        const art = await writeArticle({ slot: st.slot, kind: st.kind, sport: st.sport, writer: WRITER_FOR(st), words: b.words,
          brief: `${b.what} Build the story on these verified notes (every number in them is correct; use them, add nothing that isn't in the notes or the fact sheet). Write full paragraphs of several sentences; never a list of one-line facts.\n${st.headline}\n${st.body.join('\n')}` }, facts)
        done.push(`${st.slot}: ${art.headline}`); continue
      } catch (e: any) { done.push(`${st.slot}: writer failed (${e?.message ?? e}); desk copy filed`) }
    }
    storeStory(st, league.season, now.toISOString()); done.push(`${st.slot}: ${st.headline}`)
  }
  // the day's column, when the staff writers are on
  if (facts) for (const a of dueAssignments(facts, now).filter(a => a.slot.startsWith('col:')).slice(0, 1)) {
    try { const art = await writeArticle(a, facts); done.push(`${a.slot}: ${art.headline}`) } catch (e: any) { done.push(`${a.slot}: failed (${e?.message ?? e})`) }
  }
  return done
}

// Back issues: each morning's desk stories for the last `days` days, written from the league as it
// stood that morning and dated that morning.
export async function writeBackIssues(days = 14, now = new Date()): Promise<number> {
  ensureNewsSchema()
  const [league] = await db.select().from(leagues).where(eq(leagues.id, YSF_LEAGUE_ID)).limit(1)
  const have = new Set(db.all<{ slot: string }>(sql`SELECT slot FROM ysf_news`).map(r => r.slot))
  const today = etDate(now)
  let n = 0
  for (let i = days; i >= 1; i--) {
    const day = addDay(today, -i)
    const stories = deskStories(await buildDesk(league, day, false))
    stories.forEach((st, k) => { if (!have.has(st.slot)) { const mins = k * 7; storeStory(st, league.season, etAt(day, 7 + Math.floor(mins / 60), mins % 60)); n++ } })
  }
  return n
}
