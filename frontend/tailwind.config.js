function withOpacity(variableName) {
  return ({ opacityValue }) => {
    if (opacityValue !== undefined) {
      return `color-mix(in srgb, var(${variableName}) calc(${opacityValue} * 100%), transparent)`;
    }
    return `var(${variableName})`;
  };
}

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
        app: withOpacity('--bg-app'),

        surface: {
          DEFAULT: withOpacity('--bg-surface'),
          0: withOpacity('--bg-app'),
          1: withOpacity('--bg-surface'),
          2: withOpacity('--bg-surface-2'),
          3: withOpacity('--bg-surface-3'),
        },

        // Warm Mocha / Amber Primary System
        primary: {
          DEFAULT: withOpacity('--color-primary'),
          hover:   withOpacity('--color-primary-hover'),
          active:  withOpacity('--color-primary-active'),
          light:   withOpacity('--color-primary-light'),
          tint:    withOpacity('--color-primary-tint'),
        },

        success: {
          DEFAULT: '#10B981',
          muted:   withOpacity('--color-success-muted'),
          border:  withOpacity('--color-success-border'),
          text:    withOpacity('--color-success-text'),
        },
        warning: {
          DEFAULT: '#F59E0B',
          muted:   withOpacity('--color-warning-muted'),
          border:  withOpacity('--color-warning-border'),
          text:    withOpacity('--color-warning-text'),
        },
        danger: {
          DEFAULT: '#EF4444',
          muted:   withOpacity('--color-danger-muted'),
          border:  withOpacity('--color-danger-border'),
          text:    withOpacity('--color-danger-text'),
        },
        info: {
          DEFAULT: '#0EA5E9',
          muted:   withOpacity('--color-info-muted'),
          border:  withOpacity('--color-info-border'),
          text:    withOpacity('--color-info-text'),
        },

        // Typography Hierarchy Tokens
        'text-primary':   withOpacity('--text-primary'),
        'text-secondary': withOpacity('--text-secondary'),
        'text-muted':     withOpacity('--text-muted'),
        'text-disabled':  withOpacity('--text-disabled'),

        // Borders
        'border-default': withOpacity('--border-default'),
        'border-hover':   withOpacity('--border-hover'),
        'border-focus':   withOpacity('--color-primary'),

        /* Legacy Brand Aliases mapped to semantic variables for zero breakage */
        brand: {
          black:      withOpacity('--bg-surface'),
          darkGray:   withOpacity('--bg-surface-2'),
          gray:       withOpacity('--bg-surface-2'),
          text:       withOpacity('--text-primary'),
          yellow:     withOpacity('--color-primary'),
          yellowDark: withOpacity('--color-primary-hover'),
          accent:     withOpacity('--color-primary-light'),
          blue:       withOpacity('--color-primary'),
          green:      '#10B981',
          amber:      '#F59E0B',
          cyan:       '#0EA5E9',
          red:        '#EF4444',
        },
        zana: {
          yellow:     withOpacity('--color-primary'),
          yellowDark: withOpacity('--color-primary-hover'),
          borderTint: withOpacity('--border-default'),
          blue:       withOpacity('--color-primary'),
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