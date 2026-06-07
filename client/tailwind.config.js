/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        eyeconic: {
          'bg-primary': '#0A0F14',
          'bg-secondary': '#101720',
          'bg-tertiary': '#151E29',
          card: '#18222E',
          hover: '#1E2A38',
          'text-primary': '#F8FAFC',
          'text-secondary': '#CBD5E1',
          muted: '#94A3B8',
          accent: '#18B6A4',
          'accent-hover': '#1CC8B5',
          'accent-light': '#4DD7C8',
        },
      },
      boxShadow: {
        'card-dark': '0 4px 20px -2px rgba(0, 0, 0, 0.5), 0 2px 8px -1px rgba(0, 0, 0, 0.3)',
        'large-dark': '0 20px 40px -5px rgba(0, 0, 0, 0.7), 0 10px 20px -5px rgba(0, 0, 0, 0.5)',
        'glow-teal': '0 0 15px rgba(24, 182, 164, 0.35)',
      },
    },
  },
  safelist: [
    { pattern: /bg-eyeconic-/ },
    { pattern: /text-eyeconic-/ },
    { pattern: /border-eyeconic-/ },
  ],
  plugins: [],
};
