/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      animation: {
        'pulse-slow': 'pulse 1.6s ease-in-out infinite',
      },
      colors: {
        accent: {
          buy: '#10b981',     // emerald-500
          sell: '#f43f5e',    // rose-500
          hold: '#f59e0b',    // amber-500
        },
      },
    },
  },
  plugins: [],
};
