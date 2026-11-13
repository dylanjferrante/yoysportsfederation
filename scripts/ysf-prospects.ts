// Baseball prospects (minor-league seasons, age, ySF prospect score) from MLB's public stats feed.
//   npx tsx scripts/ysf-prospects.ts [season]
import { pullProspects } from '../src/lib/ysf-prospects'
pullProspects(process.argv[2]).then(r => { console.log('prospects:', JSON.stringify(r)); process.exit(0) }, e => { console.error(e); process.exit(1) })
