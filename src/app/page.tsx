import Link from 'next/link'

const sports = [
  { name: 'NFL',  emoji: '', bg: 'bg-blue-900',  text: 'Football',   desc: 'Weekly head-to-head matchups, PPR or standard scoring' },
  { name: 'NBA',  emoji: '', bg: 'bg-red-700',   text: 'Basketball', desc: 'Rotisserie or H2H categories, daily or weekly lineups' },
  { name: 'NHL',  emoji: '', bg: 'bg-gray-800',  text: 'Hockey',     desc: 'Goalie & skater scoring, custom position slots' },
  { name: 'MLB',  emoji: '', bg: 'bg-blue-700',  text: 'Baseball',   desc: 'Pitching & hitting categories, full stat customization' },
]

const features = [
  { icon: '', title: 'Cross-Sport Trading',       desc: 'Package an NFL 1st round pick with an MLB slugger for an NBA star. No barriers between sports.' },
  { icon: '', title: 'Commissioner Controls',     desc: 'Full control: custom scoring, roster slots, trade review, FAAB waivers, draft settings, and more.' },
  { icon: '', title: 'Unified Dashboard',          desc: 'Manage all your leagues in one place. See live scores, pending trades, and waiver claims across all sports.' },
  { icon: '', title: 'Draft Pick Trading',         desc: 'Future picks from any sport are tradeable. Build a cross-sport dynasty through the draft.' },
  { icon: '', title: 'Flexible Trade Review',     desc: 'Commissioners can approve trades, set up league-wide veto voting, or allow free processing.' },
  { icon: '', title: 'Custom Playoff Formats',    desc: 'Configure playoff bracket size, start week, and seeding rules per league.' },
]

export default function Landing() {
  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(59,130,246,0.15),transparent_60%)]" />
        <div className="relative max-w-6xl mx-auto px-6 py-28 text-center">
          <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 text-blue-300 rounded-full px-4 py-1.5 text-sm font-medium mb-8">
            The only cross-sport fantasy platform
          </div>
          <h1 className="text-5xl sm:text-7xl font-black mb-6 tracking-tight leading-[1.05]">
            Fantasy Sports
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
              Without Borders
            </span>
          </h1>
          <p className="text-xl text-slate-300 max-w-2xl mx-auto mb-10 leading-relaxed">
            Compete in NFL, NBA, NHL, and MLB fantasy leagues — and trade players and picks
            across every sport. Commissioner-grade controls for every league.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/auth/register"
              className="bg-blue-500 hover:bg-blue-400 text-white font-bold px-8 py-3.5 rounded-xl text-lg transition-colors shadow-lg shadow-blue-500/25">
              Start for Free
            </Link>
            <Link href="/leagues"
              className="bg-white/10 hover:bg-white/15 text-white font-semibold px-8 py-3.5 rounded-xl text-lg transition-colors border border-white/10">
              Browse Leagues
            </Link>
          </div>
        </div>
      </section>

      {/* Sports */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <p className="text-slate-500 text-center uppercase tracking-widest text-xs font-semibold mb-3">All four major sports</p>
          <h2 className="text-3xl font-bold text-center mb-12 text-slate-900">One Platform. Every Sport.</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            {sports.map(s => (
              <div key={s.name} className="rounded-2xl border border-slate-100 p-6 text-center hover:shadow-md transition-shadow">
                <div className={`w-14 h-14 ${s.bg} rounded-xl flex items-center justify-center text-2xl mx-auto mb-4`}>{s.emoji}</div>
                <div className="font-bold text-slate-900 mb-1">{s.name} — {s.text}</div>
                <p className="text-sm text-slate-500">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6 bg-slate-50">
        <div className="max-w-5xl mx-auto">
          <p className="text-slate-500 text-center uppercase tracking-widest text-xs font-semibold mb-3">Built for commissioners</p>
          <h2 className="text-3xl font-bold text-center mb-12 text-slate-900">Everything You Need to Run a League</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map(f => (
              <div key={f.title} className="bg-white rounded-2xl border border-slate-100 p-6 hover:shadow-md transition-shadow">
                <div className="text-3xl mb-3">{f.icon}</div>
                <h3 className="font-bold text-slate-900 mb-2">{f.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Cross-sport trading explainer */}
      <section className="py-20 px-6 bg-gradient-to-br from-slate-900 to-slate-800 text-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-6">How Cross-Sport Trading Works</h2>
          <p className="text-slate-300 text-lg mb-10 leading-relaxed">
            Propose a trade to any club in any of your leagues. Mix and match assets from different sports
            in a single trade proposal. Your NFL first-round pick plus your NHL star for someone's NBA MVP candidate.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
            {[
              { step: '1', title: 'Pick your assets', desc: 'Select players and/or draft picks from any of your sports leagues.' },
              { step: '2', title: 'Choose the other club', desc: 'Propose the trade to any club — even in a different sport league.' },
              { step: '3', title: 'Wait for review', desc: 'The recipient accepts or rejects. Commissioners can veto based on league rules.' },
            ].map(s => (
              <div key={s.step} className="bg-white/5 border border-white/10 rounded-2xl p-6">
                <div className="w-8 h-8 rounded-full bg-blue-500 text-white text-sm font-bold flex items-center justify-center mb-3">{s.step}</div>
                <h3 className="font-semibold mb-2">{s.title}</h3>
                <p className="text-slate-400 text-sm">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 bg-blue-600 text-white text-center">
        <h2 className="text-4xl font-black mb-4">Ready to build your dynasty?</h2>
        <p className="text-blue-100 mb-8 text-lg">Free to join. Create or join leagues across all four sports.</p>
        <Link href="/auth/register"
          className="bg-white text-blue-600 font-bold px-10 py-3.5 rounded-xl text-lg hover:bg-blue-50 transition-colors inline-block">
          Create Free Account
        </Link>
      </section>

      <footer className="bg-slate-900 text-slate-400 py-8 px-6 text-center text-sm">
        <p className="font-semibold text-white mb-1">Nexus Fantasy</p>
        <p>© {new Date().getFullYear()} Nexus Fantasy Platform. All rights reserved.</p>
      </footer>
    </div>
  )
}
