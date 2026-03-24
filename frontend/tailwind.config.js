/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#e8f0fe',
          100: '#c5d8fd',
          200: '#aecbfa',
          300: '#7baaf7',
          400: '#4285f4',
          500: '#1a73e8',
          600: '#1557b0',
          700: '#0d47a1',
          800: '#0a3880',
          900: '#072862',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        docs: ['Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
