const { nextui } = require("@nextui-org/react");

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./node_modules/@nextui-org/theme/dist/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    colors: {
      primary: {
        blue: '#007BFF',
        yellow: '#FFC107',
      },
      secondary: {
        blue: '#0056b3',
        yellow: '#FFECB3',
      },
      neutral: {
        white: '#FFFFFF',
        lightGray: '#F8F9FA',
        gray: '#6C757D',
        darkGray: '#343A40',
      },
      success: '#28A745',
      error: '#DC3545',
      warning: '#FFC107',
      info: '#007BFF',
    },
    extend: {},
  },
  darkMode: "class",
  plugins: [nextui()],

}

