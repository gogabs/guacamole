import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{html,js,svelte,ts}"],
  theme: {
    extend: {
      colors: {
        ink: "#20211f",
        avocado: "#52734d",
        tomato: "#b84637",
        river: "#326c8f",
        marigold: "#bd8424",
        paper: "#f7f5ef"
      },
      boxShadow: {
        panel: "0 1px 2px rgb(32 33 31 / 0.08)"
      }
    }
  },
  plugins: []
} satisfies Config;
