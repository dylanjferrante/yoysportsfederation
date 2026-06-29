import type { Config } from 'tailwindcss'

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
    extend: {},
  },
  plugins: [],
}

export default config
