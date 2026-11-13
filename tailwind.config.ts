import type { Config } from 'tailwindcss'

// ySF ink scale. The product UI is black-and-white; the only colors are the four league
// colors and each club's own primary. Tailwind's `blue` accent is remapped onto ink so
// every legacy blue link/button/ring renders in the ySF black.
const ink = {
  50: '#F2F2F2', 100: '#E5E5E5', 200: '#C7C7C7', 300: '#A6A6A6', 400: '#8A8A8A',
  500: '#4A4A4A', 600: '#000000', 700: '#1F1F1F', 800: '#1F1F1F', 900: '#000000', 950: '#000000',
}

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  // Sport identity colors are referenced dynamically via sportMeta(); keep them.
  safelist: [
    'bg-green-700', 'text-green-700', 'bg-green-50', 'border-green-700',
    'bg-orange-500', 'text-orange-600', 'bg-orange-50', 'border-orange-500',
    'bg-sky-500', 'text-sky-600', 'bg-sky-50', 'border-sky-500',
    'bg-red-600', 'text-red-600', 'bg-red-50', 'border-red-600',
  ],
  theme: {
    extend: {
      colors: {
        blue: ink,
        ink,
        ysf: { fl: '#177245', hl: '#6da7ee', ba: '#e86100', lb: '#ba0c2f' },
      },
      fontFamily: {
        sans: ['address-sans-pro', 'Address Sans Pro', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['shuttleblock', 'Shuttleblock', 'Big Shoulders Display', 'Impact', 'sans-serif'],
      },
      borderRadius: { card: '4px' },
    },
  },
  plugins: [],
}

export default config
