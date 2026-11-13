/** @type {import('next').NextConfig} */
const nextConfig = {
  // a separate build folder (NEXT_DIST_DIR) lets a production build run beside the dev server
  distDir: process.env.NEXT_DIST_DIR || '.next',
  serverExternalPackages: ['better-sqlite3', 'bcryptjs'],
  // Dev only: webpack's on-disk cache kept corrupting ("reading 'call'") after rapid edits; build in memory instead
  webpack: (config, { dev }) => { if (dev) config.cache = { type: 'memory' }; return config },
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
