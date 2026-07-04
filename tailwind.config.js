/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          black: 'rgb(var(--ink-black) / <alpha-value>)',
          dark: 'rgb(var(--ink-dark) / <alpha-value>)',
          card: 'rgb(var(--ink-card) / <alpha-value>)',
          border: 'rgb(var(--ink-border) / <alpha-value>)',
          muted: 'rgb(var(--ink-muted) / <alpha-value>)',
        },
        cream: {
          DEFAULT: 'rgb(var(--cream) / <alpha-value>)',
          muted: 'rgb(var(--cream-muted) / <alpha-value>)',
        },
        accent: {
          DEFAULT: '#c0392b',
          hover: '#e74c3c',
          gold: '#b8860b',
        },
        // v2 redesign tokens — additive alongside the legacy tokens above
        'v2-ink': '#131110',
        'v2-surface': '#1d1a17',
        'v2-cream': '#efe9dc',
        'v2-muted': '#a8a294',
        'v2-accent': '#c0392b',
        'v2-hairline': '#35312b',
      },
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        body: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"DM Mono"', 'monospace'],
        // v2 redesign fonts — namespaced so the legacy `display`/`body` keys are untouched
        'v2-display': ['Marcellus', 'serif'],
        'v2-ui': ['Archivo', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease forwards',
        'slide-up': 'slideUp 0.4s ease forwards',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: 0 },
          to: { opacity: 1 },
        },
        slideUp: {
          from: { opacity: 0, transform: 'translateY(16px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
