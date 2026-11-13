// Pulls each sport's player news from Tank01 into ysf_player_news (four calls).
//   npx tsx scripts/ysf-player-news.ts
import { pullPlayerNews } from '../src/lib/ysf-player-news'
pullPlayerNews().then(r => { console.log('player news added:', JSON.stringify(r)); process.exit(0) }, e => { console.error(e); process.exit(1) })
