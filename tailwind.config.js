/** Palette is deliberately narrow: the page is ink on paper, and the only
 *  saturated colour on screen is a compliance status. */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        paper:  '#F8FAFC',
        card:   '#FFFFFF',
        ink:    '#0F172A',
        muted:  '#64748B',
        rule:   '#E2E8F0',
        pass:   '#059669',
        fail:   '#DC2626',
        review: '#D97706',
        na:     '#64748B',
        brand: {
          50: '#EEF2FF',
          100: '#E0E7FF',
          500: '#4F46E5',
          600: '#4338CA',
          700: '#3730A3',
          900: '#1E1B4B'
        }
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace']
      },
      fontSize: {
        '2xs': ['0.6875rem', '0.95rem']
      },
      boxShadow: {
        'subtle': '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        'elevated': '0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -2px rgba(0, 0, 0, 0.05)'
      }
    }
  },
  plugins: []
}
