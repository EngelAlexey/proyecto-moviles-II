import type { Config } from "tailwindcss";
import sharedConfig from "@dado-triple/tailwind-config/tailwind.config";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  presets: [sharedConfig as Config],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
