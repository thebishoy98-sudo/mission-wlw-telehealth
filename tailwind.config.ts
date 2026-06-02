import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        forest: {
          50:  "#eff3fc",
          100: "#d6e4f7",
          200: "#adc8ef",
          300: "#84ace7",
          400: "#5b90df",
          500: "#3274d7",
          600: "#1a56b0",
          700: "#0d3d87",
          800: "#022859",
          900: "#01152e",
        },
        cream: {
          50:  "#fefdfb",
          100: "#f8f6f1",
          200: "#f0ebe0",
          300: "#e8dfd0",
        },
        teal: {
          50:  "#f0fdfa",
          100: "#ccfbf1",
          200: "#99f6e4",
          300: "#5eead4",
          400: "#2dd4bf",
          500: "#14b8a6",
          600: "#0d9488",
          700: "#0f766e",
          800: "#115e59",
          900: "#134e4a",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
