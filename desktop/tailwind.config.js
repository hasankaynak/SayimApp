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
        brand: {
          50: '#ECFDF5',
          100: '#D1FAE5',
          500: '#10B981',
          600: '#00AE78',
          700: '#047857',
        },
        navy: {
          800: '#141F36',
          900: '#0B1326',
          950: '#070D1A',
        }
      }
    },
  },
  plugins: [],
}
