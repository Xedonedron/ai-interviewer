/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'sans-serif'],
        serif: ['"Newsreader"', 'serif'],
      },
      colors: {
        canvas: '#FAF9F5',       /* Warm ivory base */
        surface: '#F4F2EC',      /* Warm stone secondary */
        subtle: '#EAE7DF',       /* Hairline border */
        charcoal: '#1C1B18',     /* Primary deep graphite */
        muted: '#636059',        /* Editorial taupe */
        stonehint: '#938F85',    /* Passive cues */
        accent: '#2B3830',       /* Warm forest/sage accent */
        accentsoft: '#EAF0EB',
        warning: '#8A5D3B',
        danger: '#B94A48',
      },
    },
  },
  plugins: [],
};
