import type { Config } from "tailwindcss";
export default { content: ["./app/**/*.{ts,tsx}"], theme: { extend: { colors: {
  brand: { 50: "#eef6f1", 600: "#1f6b4a", 700: "#17553a", 900: "#0d3524" } } } }, plugins: [] } satisfies Config;
