/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        cyber: {
          bg: '#0a0d14',
          surface: '#111726',
          card: '#161f33',
          border: '#23304a',
          cyan: '#00f2fe',
          blue: '#4facfe',
          violet: '#8a2be2',
          neonPink: '#ff007f',
          neonGreen: '#00ff88',
          neonAmber: '#ffaa00',
          neonRed: '#ff3b30'
        }
      },
      animation: {
        'pulse-glow': 'pulseGlow 2.5s infinite ease-in-out',
        'fade-in': 'fadeIn 0.3s ease-out forwards',
        'slide-up': 'slideUp 0.4s ease-out forwards'
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { opacity: 0.8, filter: 'drop-shadow(0 0 15px rgba(0,242,254,0.4))' },
          '50%': { opacity: 1, filter: 'drop-shadow(0 0 25px rgba(0,242,254,0.8))' }
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(15px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        }
      }
    },
  },
  plugins: [],
}
