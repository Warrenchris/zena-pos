/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    screens: {
      xs: '320px',
      sm: '480px',
      md: '768px',
      lg: '1024px',
      xl: '1440px',
      '2xl': '1920px',
    },
    extend: {
      /* ──────────────────────────────────────────────
         ZANA POS — ENTERPRISE WARM MOCHA / ESPRESSO SYSTEM
         Floating Shell Architecture & Dual Theme System
         ────────────────────────────────────────────── */
      colors: {
        app: 'var(--bg-app)',

        surface: {
          DEFAULT: 'var(--bg-surface)',
          0: 'var(--bg-app)',
          1: 'var(--bg-surface)',
          2: 'var(--bg-surface-2)',
          3: 'var(--bg-surface-3)',
        },

        // Warm Mocha / Amber Primary System
        primary: {
          DEFAULT: 'var(--color-primary)',
          hover:   'var(--color-primary-hover)',
          active:  'var(--color-primary-active)',
          light:   'var(--color-primary-light)',
          tint:    'var(--color-primary-tint)',
        },

        success: {
          DEFAULT: '#10B981',
          muted:   'var(--color-success-muted)',
          border:  'var(--color-success-border)',
          text:    'var(--color-success-text)',
        },
        warning: {
          DEFAULT: '#F59E0B',
          muted:   'var(--color-warning-muted)',
          border:  'var(--color-warning-border)',
          text:    'var(--color-warning-text)',
        },
        danger: {
          DEFAULT: '#EF4444',
          muted:   'var(--color-danger-muted)',
          border:  'var(--color-danger-border)',
          text:    'var(--color-danger-text)',
        },
        info: {
          DEFAULT: '#0EA5E9',
          muted:   'var(--color-info-muted)',
          border:  'var(--color-info-border)',
          text:    'var(--color-info-text)',
        },

        // Typography Hierarchy Tokens
        'text-primary':   'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted':     'var(--text-muted)',
        'text-disabled':  'var(--text-disabled)',

        // Borders
        'border-default': 'var(--border-default)',
        'border-hover':   'var(--border-hover)',
        'border-focus':   'var(--color-primary)',

        /* Legacy Brand Aliases mapped to semantic variables for zero breakage */
        brand: {
          black:      'var(--bg-surface)',
          darkGray:   'var(--bg-surface-2)',
          gray:       'var(--bg-surface-2)',
          text:       'var(--text-primary)',
          yellow:     'var(--color-primary)',
          yellowDark: 'var(--color-primary-hover)',
          accent:     'var(--color-primary-light)',
          blue:       'var(--color-primary)',
          green:      '#10B981',
          amber:      '#F59E0B',
          cyan:       '#0EA5E9',
          red:        '#EF4444',
        },
        zana: {
          yellow:     'var(--color-primary)',
          yellowDark: 'var(--color-primary-hover)',
          borderTint: 'var(--border-default)',
          blue:       'var(--color-primary)',
          green:      '#10B981',
          amber:      '#F59E0B',
          cyan:       '#0EA5E9',
          red:        '#EF4444',
        },
      },

      /* ──────────────────────────────────────────────
         EXACT MATHEMATICAL TYPOGRAPHY SCALE (Spec)
         Display: 44px, H1: 32px, H2: 24px, Card Title: 18px, Body: 15px, Caption: 13px
         ────────────────────────────────────────────── */
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      fontSize: {
        'display': ['2.75rem', { lineHeight: '1.15', letterSpacing: '-0.025em', fontWeight: '700' }], // 44px
        'h1':      ['2rem',    { lineHeight: '1.2',  letterSpacing: '-0.02em',  fontWeight: '600' }], // 32px
        'h2':      ['1.5rem',   { lineHeight: '1.3',  letterSpacing: '-0.01em',  fontWeight: '600' }], // 24px
        'h3':      ['1.125rem', { lineHeight: '1.4',  letterSpacing: '-0.005em', fontWeight: '600' }], // 18px
        'body':    ['0.9375rem',{ lineHeight: '1.5',  fontWeight: '400' }],                           // 15px
        'caption': ['0.8125rem',{ lineHeight: '1.5',  fontWeight: '400' }],                           // 13px
        'small':   ['0.875rem', { lineHeight: '1.4',  fontWeight: '500' }],
      },

      /* ──────────────────────────────────────────────
         8PT GRID SPACING & CORNERS
         ────────────────────────────────────────────── */
      borderRadius: {
        'sm':   '6px',
        'md':   '8px',
        'lg':   '12px',
        'xl':   '20px',
        '2xl':  '24px',
        'full': '999px',
      },

      boxShadow: {
        '2xs':      '0 1px 2px 0 rgba(0, 0, 0, 0.04)',
        'sm':       'var(--shadow-sm)',
        'md':       'var(--shadow-md)',
        'lg':       'var(--shadow-lg)',
        'floating': 'var(--shadow-floating)',
        'modal':    'var(--shadow-modal)',
      },

      transitionDuration: {
        '150': '150ms',
        '200': '200ms',
      },
    },
  },
  plugins: [],
}