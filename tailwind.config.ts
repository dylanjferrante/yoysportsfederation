import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        ysf: {
          navy: '#0A1628',
          blue: '#1E3A5F',
          gold: '#C9A84C',
          silver: '#8B9DB5',
          light: '#F0F4F8',
        },
        nfl: { DEFAULT: '#013369', light: '#D50A0A' },
        nhl: { DEFAULT: '#000000', light: '#FFFFFF' },
        nba: { DEFAULT: '#C9082A', light: '#1D428A' },
        mlb: { DEFAULT: '#002D72', light: '#D50032' },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
