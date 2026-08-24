/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        radar: {
          charcoal: '#0B0F12',
          golden: '#EAB308',
          orange: '#F97316',
          cyan: '#38BDF8',
          red: '#DC2626'
        }
      }
    },
  },
  plugins: [],
}
