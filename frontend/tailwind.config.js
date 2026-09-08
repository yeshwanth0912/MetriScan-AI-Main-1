/** Palette is deliberately narrow: the page is ink on paper, and the only
 *  saturated colour on screen is a compliance status. */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        paper:  '#F7F8F9',
        card:   '#FFFFFF',
        ink:    '#1B2A3A',
        muted:  '#5B6B7B',
        rule:   '#C9D2DA',
        pass:   '#1B7F4C',
        fail:   '#B3261E',
        review: '#B26A00',
        na:     '#6B7785'
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace']
      },
      fontSize: {
        '2xs': ['0.6875rem', '0.95rem']
      }
    }
  },
  plugins: []
}
