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
      '3xl': '2560px',
      '4xl': '3840px',
    },
    extend: {
      /* ──────────────────────────────────────────────
         ENTERPRISE SAAS LIGHT COLOR SYSTEM (Linear / Stripe / Vercel)
         ────────────────────────────────────────────── */
      colors: {
        // App background (soft neutral)
        app: '#F6F8FB',

        // Surface panels (floating cards)
        surface: {
          DEFAULT: '#FFFFFF',
          0: '#F6F8FB',
          1: '#FFFFFF',
          2: '#FAFAFB',
          3: '#F3F4F6',
        },

        // Primary Accent — Refined Gold / Amber
        primary: {
          DEFAULT: '#D4A017',
          hover:   '#C39110',
          active:  '#B28209',
          light:   '#FEF9C3',
          tint:    '#FFFBEB',
        },

        // Semantic status colors
        success: {
          DEFAULT: '#22C55E',
          muted:   '#F0FDF4',
          border:  '#DCFCE7',
          text:    '#15803D',
        },
        warning: {
          DEFAULT: '#F59E0B',
          muted:   '#FFFBEB',
          border:  '#FEF3C7',
          text:    '#B45309',
        },
        danger: {
          DEFAULT: '#EF4444',
          muted:   '#FEF2F2',
          border:  '#FEE2E2',
          text:    '#B91C1C',
        },
        info: {
          DEFAULT: '#38BDF8',
          muted:   '#F0F9FF',
          border:  '#E0F2FE',
          text:    '#0369A1',
        },

        // Text hierarchy
        'text-primary':   '#111827',
        'text-secondary': '#6B7280',
        'text-muted':     '#9CA3AF',
        'text-disabled':  '#D1D5DB',

        // Borders
        'border-default': '#E5E7EB',
        'border-hover':   '#D1D5DB',
        'border-focus':   '#D4A017',

        /* Legacy Aliases */
        brand: {
          black:      '#111827',
          darkGray:   '#1F2937',
          gray:       '#F3F4F6',
          text:       '#111827',
          yellow:     '#D4A017',
          yellowDark: '#C39110',
          accent:     '#FEF08A',
          blue:       '#2563EB',
          green:      '#16A34A',
          amber:      '#D97706',
          cyan:       '#0284C7',
          red:        '#DC2626',
        },
        zana: {
          yellow:     '#D4A017',
          yellowDark: '#C39110',
          borderTint: '#E5E7EB',
          blue:       '#2563EB',
          green:      '#16A34A',
          amber:      '#D97706',
          cyan:       '#0284C7',
          red:        '#DC2626',
        },
      },

      /* ──────────────────────────────────────────────
         TYPOGRAPHY (Inter)
         ────────────────────────────────────────────── */
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      fontSize: {
        'display': ['2.75rem', { lineHeight: '1.15', letterSpacing: '-0.025em', fontWeight: '700' }], // 44px
        'h1':      ['2.25rem', { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '600' }],  // 36px
        'h2':      ['1.75rem', { lineHeight: '1.25', letterSpacing: '-0.015em', fontWeight: '600' }], // 28px
        'h3':      ['1.375rem',{ lineHeight: '1.3', letterSpacing: '-0.01em', fontWeight: '600' }],  // 22px
        'h4':      ['1.125rem',{ lineHeight: '1.4', fontWeight: '600' }],                            // 18px
        'body':    ['0.9375rem', { lineHeight: '1.5', fontWeight: '400' }],                           // 15px
        'small':   ['0.84375rem',{ lineHeight: '1.5', fontWeight: '400' }],                          // 13.5px
        'caption': ['0.75rem', { lineHeight: '1.5', fontWeight: '400' }],                             // 12px
      },

      /* ──────────────────────────────────────────────
         BORDER RADIUS (Spec: 20px cards, 24px sidebar)
         ────────────────────────────────────────────── */
      borderRadius: {
        'sm':   '6px',
        'md':   '10px',
        'lg':   '14px',
        'xl':   '20px',
        '2xl':  '24px',
        'full': '999px',
      },

      /* ──────────────────────────────────────────────
         ELEVATION / SHADOWS (Soft, non-flashy SaaS shadows)
         ────────────────────────────────────────────── */
      boxShadow: {
        'sm':       '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        'md':       '0 4px 12px -2px rgba(0, 0, 0, 0.04), 0 2px 4px -2px rgba(0, 0, 0, 0.02)',
        'lg':       '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.02)',
        'floating': '0 12px 32px -4px rgba(0, 0, 0, 0.06), 0 4px 12px -2px rgba(0, 0, 0, 0.03)',
        'modal':    '0 20px 48px -8px rgba(0, 0, 0, 0.12), 0 8px 16px -4px rgba(0, 0, 0, 0.04)',
        'glow':     '0 0 16px rgba(212, 160, 23, 0.12)',
        // Legacy aliases
        'zana':     '0 4px 12px -2px rgba(0, 0, 0, 0.04)',
        'zana-lg':  '0 10px 25px -5px rgba(0, 0, 0, 0.05)',
      },

      /* ──────────────────────────────────────────────
         SUBTLE MOTION (150-200ms ease-out)
         ────────────────────────────────────────────── */
      transitionDuration: {
        '150': '150ms',
        '200': '200ms',
        '250': '250ms',
      },
      animation: {
        'fade-in':   'fadeIn 150ms ease-out',
        'fade-up':   'fadeUp 200ms ease-out both',
        'slide-in':  'slideIn 200ms ease-out',
        'scale-in':  'scaleIn 150ms ease-out',
        // Legacy aliases
        'fadeIn':    'fadeIn 150ms ease-out',
        'slideIn':   'slideIn 200ms ease-out',
        'scaleIn':   'scaleIn 150ms ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeUp: {
          '0%':   { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          '0%':   { opacity: '0', transform: 'translateX(100%)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        scaleIn: {
          '0%':   { opacity: '0', transform: 'scale(0.98)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
}