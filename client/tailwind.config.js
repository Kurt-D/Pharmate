/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  important: '.cg-portal',
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        pharmate: {
          blue: '#4C8CE4',
          navy: '#1E2E4A',
        },
      },
      fontFamily: {
        caregiver: ['"Plus Jakarta Sans"', 'Poppins', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'health-card': '0 5px 16px rgba(30, 46, 74, 0.07)',
      },
    },
  },
  plugins: [],
};
