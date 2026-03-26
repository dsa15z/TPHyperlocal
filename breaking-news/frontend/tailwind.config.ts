import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#0B0E14",
          50: "#0F1319",
          100: "#141820",
          200: "#1A1F2B",
          300: "#232936",
          400: "#2E3545",
        },
        accent: {
          DEFAULT: "#3B82F6",
          dim: "#2563EB",
        },
        score: {
          breaking: {
            DEFAULT: "#EF4444",
            light: "#FCA5A5",
            bg: "rgba(239, 68, 68, 0.12)",
          },
          trending: {
            DEFAULT: "#F97316",
            light: "#FDBA74",
            bg: "rgba(249, 115, 22, 0.12)",
          },
          confidence: {
            DEFAULT: "#22C55E",
            light: "#86EFAC",
            bg: "rgba(34, 197, 94, 0.12)",
          },
          locality: {
            DEFAULT: "#3B82F6",
            light: "#93C5FD",
            bg: "rgba(59, 130, 246, 0.12)",
          },
        },
        status: {
          breaking: "#EF4444",
          trending: "#F97316",
          active: "#3B82F6",
          stale: "#6B7280",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      animation: {
        "pulse-live": "pulse-live 2s ease-in-out infinite",
        "fade-in": "fade-in 0.3s ease-out",
      },
      keyframes: {
        "pulse-live": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
