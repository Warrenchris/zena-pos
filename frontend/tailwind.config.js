/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    // Ensure all component files are scanned
    "./src/**/*.jsx",
    "./src/**/*.tsx",
    "./src/**/*.js",
    "./src/**/*.ts",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          black: '#0b0b0c',
          gray: '#121214',
          yellow: '#FFD600',
          yellowDark: '#E6C200',
          accent: '#FFE166'
        },
        zana: {
          yellow: '#FFD600',
          yellowDark: '#E6C200',
          borderTint: 'rgba(255, 214, 0, 0.2)'
        }
      },
      boxShadow: {
        'zana': '0 8px 24px rgba(255, 214, 0, 0.12)',
        'zana-lg': '0 12px 32px rgba(255, 214, 0, 0.2)'
      },
      animation: {
        'fadeIn': 'fadeIn 0.5s ease-in',
        'slideIn': 'slideIn 0.5s ease-out',
        'scaleIn': 'scaleIn 0.25s ease-out'
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideIn: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.98)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' }
        }
      },
      transitionProperty: {
        'height': 'height',
        'spacing': 'margin, padding',
      },
    },
  },
  plugins: [],
}