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
         SEMANTIC COLOR TOKENS (v2.0 spec)
         ────────────────────────────────────────────── */
      colors: {
        // Background surfaces (dark-first)
        surface: {
          0: '#0B0B0C',   // Deep charcoal — body, shell
          1: '#111214',   // Cards, panels
          2: '#17181B',   // Elevated surfaces
          3: '#1F2126',   // Popovers, dropdowns, tooltips
        },

        // Primary accent — brand gold
        primary: {
          DEFAULT: '#FFD600',
          hover:   '#F2C800',
          active:  '#D9B400',
        },

        // Semantic status colors
        success: {
          DEFAULT: '#22C55E',
          muted:   'rgba(34, 197, 94, 0.15)',
        },
        warning: {
          DEFAULT: '#F59E0B',
          muted:   'rgba(245, 158, 11, 0.15)',
        },
        danger: {
          DEFAULT: '#EF4444',
          muted:   'rgba(239, 68, 68, 0.15)',
        },
        info: {
          DEFAULT: '#38BDF8',
          muted:   'rgba(56, 189, 248, 0.15)',
        },

        // Text hierarchy
        'text-primary':   '#F9FAFB',
        'text-secondary': '#D1D5DB',
        'text-muted':     '#9CA3AF',
        'text-disabled':  '#6B7280',

        // Borders
        'border-default': 'rgba(255, 214, 0, 0.15)',
        'border-hover':   'rgba(255, 214, 0, 0.30)',
        'border-focus':   'rgba(255, 214, 0, 0.50)',

        /* ──────────────────────────────────────────
           LEGACY ALIASES (kept for migration)
           Remove in Phase 5 after all refs updated
           ────────────────────────────────────────── */
        brand: {
          black:     '#0b0b0c',
          darkGray:  '#0f0f11',
          gray:      '#121214',
          text:      '#e5e7eb',
          yellow:    '#FFD600',
          yellowDark:'#E6C200',
          accent:    '#FFE166',
          blue:      '#3b82f6',
          green:     '#10b981',
          amber:     '#f59e0b',
          cyan:      '#0ea5e9',
          red:       '#ef4444',
        },
        zana: {
          yellow:     '#FFD600',
          yellowDark: '#E6C200',
          borderTint: 'rgba(255, 214, 0, 0.2)',
          blue:       '#3b82f6',
          green:      '#10b981',
          amber:      '#f59e0b',
          cyan:       '#0ea5e9',
          red:        '#ef4444',
        },
      },

      /* ──────────────────────────────────────────────
         TYPOGRAPHY (Inter, spec scale)
         ────────────────────────────────────────────── */
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      fontSize: {
        'display': ['3rem',    { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '700' }],  // 48px
        'h1':      ['2.25rem', { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '700' }],  // 36px
        'h2':      ['1.875rem',{ lineHeight: '1.25', letterSpacing: '-0.01em', fontWeight: '600' }], // 30px
        'h3':      ['1.5rem',  { lineHeight: '1.3', fontWeight: '600' }],                            // 24px
        'h4':      ['1.25rem', { lineHeight: '1.4', fontWeight: '600' }],                            // 20px
        'body':    ['1rem',    { lineHeight: '1.5', fontWeight: '400' }],                             // 16px
        'small':   ['0.875rem',{ lineHeight: '1.5', fontWeight: '400' }],                             // 14px
        'caption': ['0.75rem', { lineHeight: '1.5', fontWeight: '400' }],                             // 12px
      },

      /* ──────────────────────────────────────────────
         BORDER RADIUS (spec values)
         ────────────────────────────────────────────── */
      borderRadius: {
        'sm':   '6px',
        'md':   '10px',
        'lg':   '14px',
        'xl':   '18px',
        '2xl':  '24px',
        'full': '999px',
      },

      /* ──────────────────────────────────────────────
         ELEVATION / SHADOWS
         ────────────────────────────────────────────── */
      boxShadow: {
        'sm':       '0 1px 3px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(0, 0, 0, 0.2)',
        'md':       '0 4px 12px rgba(0, 0, 0, 0.3)',
        'lg':       '0 8px 24px rgba(0, 0, 0, 0.35)',
        'floating': '0 12px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 214, 0, 0.08)',
        'modal':    '0 20px 48px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 214, 0, 0.1)',
        'glow':     '0 0 20px rgba(255, 214, 0, 0.15)',
        'glow-lg':  '0 0 40px rgba(255, 214, 0, 0.25)',
        // Legacy aliases
        'zana':     '0 8px 24px rgba(255, 214, 0, 0.12)',
        'zana-lg':  '0 12px 32px rgba(255, 214, 0, 0.2)',
      },

      /* ──────────────────────────────────────────────
         ANIMATION (max 300ms per spec)
         ────────────────────────────────────────────── */
      transitionDuration: {
        '150': '150ms',
        '200': '200ms',
        '250': '250ms',
        '300': '300ms',
      },
      animation: {
        'fade-in':     'fadeIn 200ms ease-out',
        'fade-up':     'fadeUp 250ms ease-out both',
        'slide-in':    'slideIn 250ms ease-out',
        'slide-up':    'slideUp 200ms ease-out',
        'scale-in':    'scaleIn 200ms ease-out',
        'pulse-soft':  'pulseSoft 3s ease-in-out infinite',
        'shimmer':     'shimmer 2s infinite',
        'spin-slow':   'spin 1.5s linear infinite',
        // Legacy aliases
        'fadeIn':      'fadeIn 200ms ease-out',
        'slideIn':     'slideIn 250ms ease-out',
        'scaleIn':     'scaleIn 200ms ease-out',
        'bounce-gentle': 'bounceGentle 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeUp: {
          '0%':   { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          '0%':   { opacity: '0', transform: 'translateX(100%)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideUp: {
          '0%':   { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%':   { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.7' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-1000px 0' },
          '100%': { backgroundPosition: '1000px 0' },
        },
        bounceGentle: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%':      { transform: 'translateY(-4px)' },
        },
      },
      transitionProperty: {
        'height': 'height',
        'spacing': 'margin, padding',
      },
    },
  },
  plugins: [],
}