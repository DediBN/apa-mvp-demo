import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        command: {
          bg: "#08141F",
          panel: "#0E1D2B",
          panelElevated: "#142738",
          border: "#1F3B51",
          text: "#E6F3FF",
          muted: "#8DA9BF",
          action: "#64FFDA",
          pass: "#2FCC71",
          fail: "#FF6B6B",
          warning: "#FFC857",
          success: "#2FCC71"
        }
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(100,255,218,0.28), 0 0 24px rgba(100,255,218,0.16)",
        panel: "0 18px 45px rgba(2, 10, 16, 0.35)"
      },
      backgroundImage: {
        "command-grid":
          "linear-gradient(rgba(100,255,218,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(100,255,218,0.06) 1px, transparent 1px)",
        "command-radial":
          "radial-gradient(1200px circle at 8% -10%, rgba(100,255,218,0.2), transparent 40%), radial-gradient(800px circle at 110% 10%, rgba(31,59,81,0.8), transparent 45%)"
      },
      fontFamily: {
        sans: ["IBM Plex Sans", "Segoe UI", "sans-serif"],
        mono: ["IBM Plex Mono", "Consolas", "monospace"]
      },
      keyframes: {
        pulseLine: {
          "0%, 100%": { opacity: "0.35" },
          "50%": { opacity: "1" }
        },
        radarSweep: {
          "0%": { transform: "translateX(-50%) translateY(-100%) rotate(0deg)", opacity: "0.35" },
          "50%": { opacity: "1" },
          "100%": { transform: "translateX(-50%) translateY(-100%) rotate(360deg)", opacity: "0.35" }
        },
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" }
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        }
      },
      animation: {
        pulseLine: "pulseLine 2.2s ease-in-out infinite",
        radarSweep: "radarSweep 2.4s linear infinite",
        fadeUp: "fadeUp 0.45s ease-out",
        fadeIn: "fadeIn 0.35s ease-out",
        slideUp: "slideUp 0.4s ease-out"
      }
    }
  },
  plugins: []
};

export default config;
