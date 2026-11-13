/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['better-sqlite3', 'bcryptjs'],
  // ySF: the old Nexus odds page is the Cup Race; the schedule lives on Scores
  async redirects() {
    return [
      { source: '/leagues/ysf/odds', destination: '/leagues/ysf/cup', permanent: false },
      { source: '/leagues/ysf/schedule', destination: '/leagues/ysf/scores', permanent: false },
      { source: '/leagues/ysf/seasons', destination: '/leagues/ysf/history', permanent: false },
    ]
  },
}

module.exports = nextConfig
