/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        emeraldDark: '#071a12',
        emeraldSurface: '#0d281e',
        emeraldAccent: '#1b4d36',
        mintGreen: '#38d39f',
        coralRed: '#ff4757',
        creamCard: '#f6f8f5'
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'sans-serif']
      }
    }
  },
  plugins: []
};

