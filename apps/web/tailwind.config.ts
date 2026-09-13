import type { Config } from 'tailwindcss'

/**
 * receivable.eth design tokens.
 *
 * Warm cream canvas, white surfaces, deep forest green. The palette is deliberately restrained:
 * this is a product that asks people to trust it with invoices, and financial software earns that
 * with quiet typography and generous whitespace rather than saturated colour. Green carries
 * meaning here (verified, financed, paid) so it is never used decoratively.
 */
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // canvas + surfaces
        bg: '#F7F6F1', // warm cream page
        surface: '#FFFFFF', // cards
        sand: '#F1EFE7', // subtle fills, hovers, table headers
        border: {
          DEFAULT: '#E4E1D6',
          strong: '#D2CEBF',
        },

        // ink
        fg: '#16211C', // near-black with a green cast
        muted: '#6B7770', // secondary text
        faint: '#939C95', // tertiary / captions

        // brand — green means verified, financed, settled
        accent: {
          DEFAULT: '#14663F',
          hover: '#0E4F30',
          soft: '#E8F1EB',
          ring: '#9CC4AE',
        },

        // semantic
        good: { DEFAULT: '#14663F', soft: '#E8F1EB' },
        warn: { DEFAULT: '#8A6212', soft: '#FAF1DE' },
        bad: { DEFAULT: '#A32B25', soft: '#FBEAE8' },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'Inter',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'SF Mono', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.04em' }],
      },
      boxShadow: {
        card: '0 1px 2px rgba(22, 33, 28, 0.04), 0 1px 3px rgba(22, 33, 28, 0.03)',
        lift: '0 2px 4px rgba(22, 33, 28, 0.05), 0 8px 20px -6px rgba(22, 33, 28, 0.10)',
      },
      borderRadius: { xl: '0.75rem', '2xl': '1rem' },
    },
  },
  plugins: [],
} satisfies Config
