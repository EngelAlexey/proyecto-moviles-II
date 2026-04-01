// tailwind.config.js
const sharedConfig = require("../tailwind-config/tailwind.config");

module.exports = {
  content: ["./App.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      ...sharedConfig.default.theme.extend,
    },
  },
  plugins: [],
};
