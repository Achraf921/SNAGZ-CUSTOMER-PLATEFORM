/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'sna-primary': '#0047AB', // SNA GZ primary blue
        'sna-secondary': '#FFD700', // SNA GZ secondary gold
        'sna-gray': '#F3F4F6',
        'sna-dark': '#1F2937',
        'sna-error': '#DC2626',
        'sna-success': '#059669',
      },
      fontFamily: {
        'heading': ['Montserrat', 'sans-serif'],
        'body': ['Open Sans', 'sans-serif'],
      },
      spacing: {
        'form-section': '2.5rem',
      },
      borderRadius: {
        'sna': '0.5rem',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
} 