/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        urgent:    { DEFAULT: '#EF4444', light: '#FEE2E2', border: '#FECACA' },
        important: { DEFAULT: '#F97316', light: '#FFEDD5', border: '#FED7AA' },
        normal:    { DEFAULT: '#EAB308', light: '#FEF9C3', border: '#FEF08A' },
        faible:    { DEFAULT: '#22C55E', light: '#DCFCE7', border: '#BBF7D0' },
      },
    },
  },
  plugins: [],
}
