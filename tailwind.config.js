/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/client/**/*.{tsx,ts,jsx,js}",
    "./public/index.html"
  ],
  theme: {
    extend: {
      colors: {
        voice: {
          active: '#10b981',
          'active-light': '#34d399',
          idle: '#6b7280',
          'idle-light': '#9ca3af',
          background: '#1f2937',
          'background-light': '#374151',
          surface: '#111827',
          'surface-light': '#1f2937',
        }
      },
      animation: {
        'pulse-mic': 'pulse-mic 1.5s ease-in-out infinite',
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-up': 'slide-up 0.3s ease-out',
      },
      keyframes: {
        'pulse-mic': {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(1.1)', opacity: '0.8' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        }
      }
    },
  },
  plugins: [],
}
