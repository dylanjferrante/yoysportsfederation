// Write any ySF News stories that are due (run hourly by the scheduler). --dry prints the fact sheet
// summary and the due assignments without writing.
import { factSheet, dueAssignments, writeDueNews, newsConfigured } from '../src/lib/ysf-news'

async function main() {
  if (process.argv.includes('--dry')) {
    const f = await factSheet()
    const json = JSON.stringify(f)
    console.log(`fact sheet: ${json.length} chars (~${Math.round(json.length / 4)} tokens)`)
    console.log('top performances:', f.topPerformances.slice(0, 3))
    console.log('this week:', JSON.stringify(f.thisWeek[0]))
    console.log('due:', dueAssignments(f).map(a => `${a.slot} → ${a.writer} (${a.kind})`))
    console.log('api key set:', newsConfigured())
    return
  }
  for (const line of await writeDueNews()) console.log(line)
}
main().then(() => process.exit(0), e => { console.error(e); process.exit(1) })
