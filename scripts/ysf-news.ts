// ySF News: write the stories that are due (the scheduler runs this hourly).
//   --back 14          also write back issues for the last 14 days (once; existing stories are kept)
//   --preview 2026-11-10   print that morning's desk stories without storing them
import { db } from '../src/db'
import { leagues } from '../src/db/schema'
import { eq } from 'drizzle-orm'
import { writeDueNews, writeBackIssues } from '../src/lib/ysf-news'
import { buildDesk, deskStories } from '../src/lib/ysf-wire'

async function main() {
  const i = process.argv.indexOf('--preview')
  if (i > 0) {
    const [league] = await db.select().from(leagues).where(eq(leagues.id, 'ysf')).limit(1)
    for (const st of deskStories(await buildDesk(league, process.argv[i + 1], false))) console.log(`\n[${st.slot}] ${st.headline}\n  ${st.dek}\n  ${st.body.join('\n  ')}`)
    return
  }
  const b = process.argv.indexOf('--back')
  if (b > 0) console.log(`back issues: ${await writeBackIssues(Number(process.argv[b + 1] ?? 14))} stories`)
  for (const line of await writeDueNews()) console.log(line)
}
main().then(() => process.exit(0), e => { console.error(e); process.exit(1) })
