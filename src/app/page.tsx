import Link from 'next/link'

const sports = [
  { name: 'NFL', emoji: '🏈', color: 'bg-blue-900', description: 'Football fantasy with weekly matchups' },
  { name: 'NBA', emoji: '🏀', color: 'bg-red-700', description: 'Basketball rotisserie & head-to-head' },
  { name: 'NHL', emoji: '🏒', color: 'bg-gray-800', description: 'Hockey fantasy all season long' },
  { name: 'MLB', emoji: '⚾', color: 'bg-blue-700', description: 'Baseball from Opening Day to the Series' },
]

const features = [
  {
    title: 'Cross-Sport Trading',
    description: 'Trade an NFL first-round pick for an NBA superstar. Package MLB players for NHL draft capital. No sport boundaries.',
    icon: '🔄',
  },
  {
    title: 'Unified Trade Hub',
    description: 'One place to propose, review, and track every deal across all four leagues. See the full value of your sports portfolio.',
    icon: '🏦',
  },
  {
    title: 'Multi-League Management',
    description: 'Manage rosters across NFL, NBA, NHL, and MLB from a single dashboard. Set lineups, add players, and dominate every sport.',
    icon: '📊',
  },
  {
    title: 'Draft Pick Market',
    description: 'Future picks from any sport can be traded today. Build dynasties by acquiring picks across multiple sports.',
    icon: '🎯',
  },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="bg-ysf-navy text-white py-24 px-4">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-ysf-gold/20 border border-ysf-gold/30 text-ysf-gold rounded-full px-4 py-1.5 text-sm font-medium mb-6">
            🏆 The YSF Fantasy Federation
          </div>
          <h1 className="text-5xl sm:text-6xl font-black mb-6 leading-tight tracking-tight">
            Fantasy Sports,{' '}
            <span className="text-ysf-gold">No Limits</span>
          </h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto mb-10">
            The only fantasy platform that lets you trade players and picks across NFL, NHL, NBA, and MLB.
            Build the ultimate cross-sport dynasty.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/auth/register" className="btn-gold text-base px-8 py-3 rounded-xl font-bold shadow-lg">
              Start Your Dynasty
            </Link>
            <Link href="/leagues" className="btn-secondary text-base px-8 py-3 rounded-xl font-bold border-white/30 text-white hover:bg-white/10">
              Browse Leagues
            </Link>
          </div>
        </div>
      </section>

      {/* Sports */}
      <section className="py-16 px-4 bg-white">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-3 text-ysf-navy">Four Sports. One Platform.</h2>
          <p className="text-gray-500 text-center mb-10">Compete in every major sport, all in one place.</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {sports.map((sport) => (
              <div key={sport.name} className="card p-6 text-center hover:shadow-md transition-shadow">
                <div className={`w-16 h-16 ${sport.color} rounded-2xl flex items-center justify-center text-3xl mx-auto mb-3`}>
                  {sport.emoji}
                </div>
                <h3 className="font-bold text-lg mb-1 text-ysf-navy">{sport.name}</h3>
                <p className="text-sm text-gray-500">{sport.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 px-4 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-3 text-ysf-navy">Built for Cross-Sport GMs</h2>
          <p className="text-gray-500 text-center mb-10">Everything you need to dominate every sport.</p>
          <div className="grid md:grid-cols-2 gap-6">
            {features.map((f) => (
              <div key={f.title} className="card p-6 flex gap-4 hover:shadow-md transition-shadow">
                <div className="text-3xl flex-shrink-0">{f.icon}</div>
                <div>
                  <h3 className="font-bold text-lg mb-2 text-ysf-navy">{f.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{f.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 bg-ysf-navy text-white text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-4xl font-black mb-4">Ready to build your dynasty?</h2>
          <p className="text-gray-300 mb-8">Join the YSF Fantasy Federation and start making moves across all four sports.</p>
          <Link href="/auth/register" className="btn-gold text-base px-10 py-3 rounded-xl font-bold shadow-lg inline-block">
            Create Free Account
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-8 px-4 text-center text-sm">
        <p className="font-bold text-white mb-1">YSF Fantasy Federation</p>
        <p>© {new Date().getFullYear()} Yoy Sports Federation. All rights reserved.</p>
      </footer>
    </div>
  )
}
