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
         ENTERPRISE SAAS SLATE BLUE SYSTEM (Linear / Stripe / Vercel)
         ────────────────────────────────────────────── */
      colors: {
        app: '#F8FAFC', // Slate 50

        surface: {
          DEFAULT: '#FFFFFF',
          0: '#F8FAFC',
          1: '#FFFFFF',
          2: '#F1F5F9', // Slate 100
          3: '#E2E8F0', // Slate 200
        },

        // Calm Enterprise Slate / Indigo Accent
        primary: {
          DEFAULT: '#2563EB', // Blue 600
          hover:   '#1D4ED8', // Blue 700
          active:  '#1E40AF', // Blue 800
          light:   '#DBEAFE', // Blue 100
          tint:    '#EFF6FF', // Blue 50
        },

        success: {
          DEFAULT: '#10B981',
          muted:   '#ECFDF5',
          border:  '#A7F3D0',
          text:    '#047857',
        },
        warning: {
          DEFAULT: '#F59E0B',
          muted:   '#FFFBEB',
          border:  '#FDE68A',
          text:    '#B45309',
        },
        danger: {
          DEFAULT: '#EF4444',
          muted:   '#FEF2F2',
          border:  '#FECACA',
          text:    '#B91C1C',
        },
        info: {
          DEFAULT: '#0EA5E9',
          muted:   '#F0F9FF',
          border:  '#BAE6FD',
          text:    '#0369A1',
        },

        // Typography Hierarchy (Slate)
        'text-primary':   '#0F172A', // Slate 900
        'text-secondary': '#475569', // Slate 600
        'text-muted':     '#94A3B8', // Slate 400
        'text-disabled':  '#CBD5E1', // Slate 300

        // Borders
        'border-default': '#E2E8F0', // Slate 200
        'border-hover':   '#CBD5E1', // Slate 300
        'border-focus':   '#2563EB',

        /* Legacy Aliases */
        brand: {
          black:      '#0F172A',
          darkGray:   '#1E293B',
          gray:       '#F1F5F9',
          text:       '#0F172A',
          yellow:     '#2563EB',
          yellowDark: '#1D4ED8',
          accent:     '#DBEAFE',
          blue:       '#2563EB',
          green:      '#10B981',
          amber:      '#F59E0B',
          cyan:       '#0EA5E9',
          red:        '#EF4444',
        },
        zana: {
          yellow:     '#2563EB',
          yellowDark: '#1D4ED8',
          borderTint: '#E2E8F0',
          blue:       '#2563EB',
          green:      '#10B981',
          amber:      '#F59E0B',
          cyan:       '#0EA5E9',
          red:        '#EF4444',
        },
      },

      /* ──────────────────────────────────────────────
         EXACT MATHEMATICAL TYPOGRAPHY SCALE (Spec)
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
        'sm':       '0 1px 2px 0 rgba(15, 23, 42, 0.03)',
        'md':       '0 4px 12px -2px rgba(15, 23, 42, 0.04), 0 2px 4px -2px rgba(15, 23, 42, 0.02)',
        'lg':       '0 10px 25px -5px rgba(15, 23, 42, 0.05), 0 8px 10px -6px rgba(15, 23, 42, 0.02)',
        'floating': '0 12px 32px -4px rgba(15, 23, 42, 0.06), 0 4px 12px -2px rgba(15, 23, 42, 0.03)',
        'modal':    '0 20px 48px -8px rgba(15, 23, 42, 0.12), 0 8px 16px -4px rgba(15, 23, 42, 0.04)',
      },

      transitionDuration: {
        '150': '150ms',
        '200': '200ms',
      },
    },
  },
  plugins: [],
}