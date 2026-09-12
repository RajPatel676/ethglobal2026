import type { Config } from 'tailwindcss'

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0b0d11',
        surface: '#141821',
        border: '#232936',
        muted: '#8b94a7',
        fg: '#e8ecf4',
        accent: '#5b8cff',
        good: '#3fbf7f',
        warn: '#e0a63c',
        bad: '#e0555f',
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config
