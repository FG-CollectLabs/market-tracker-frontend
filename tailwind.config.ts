import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        positive: "#16a34a",
        negative: "#dc2626",
        neutral: "#6b7280",
      },
    },
  },
  plugins: [],
} satisfies Config;
