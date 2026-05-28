import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        mata: {
          50: '#fdf3f3',
          100: '#fbe5e5',
          200: '#f7cdcd',
          300: '#f0a8a8',
          400: '#e57676',
          500: '#d44a4a',
          600: '#b91c1c',
          700: '#9b1c1c',
          800: '#7f1d1d',
          900: '#651414',
          950: '#3a0a0a',
        },
        stone: {
          25: '#fafaf9',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.06)',
        card: '0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.04)',
        lifted: '0 4px 6px -1px rgba(0,0,0,0.05), 0 10px 20px -5px rgba(0,0,0,0.08)',
      },
    },
  },
  plugins: [],
};

export default config;
