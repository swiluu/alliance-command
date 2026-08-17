import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // War-Room-Palette.
        // Die Grundfarbe heisst bewusst NICHT "base": Tailwind erzeugt sonst
        // `text-base` doppelt – einmal als Schriftgrösse, einmal als Farbe –
        // und die Farbregel gewinnt. Text mit `text-base` wäre dann schwarz
        // auf schwarzem Grund.
        ground: "#0B0F0D",
        panel: "#141914",
        "panel-2": "#1B211A",
        line: "#262E23",
        sand: "#C9A24B",
        "sand-dim": "#8A6E33",
        ok: "#6E8F5C",
        "ok-deep": "#3F5636",
        danger: "#B4432F",
        "danger-dim": "#6E2A1D",
        ink: "#E7E9E3",
        muted: "#8C948A",
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        panel: "0 1px 0 rgba(255,255,255,0.03) inset, 0 8px 24px rgba(0,0,0,0.35)",
      },
    },
  },
  plugins: [],
};

export default config;
