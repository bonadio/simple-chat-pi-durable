import vinext from "vinext";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vinext()],
  // `ai` pulls in CommonJS-only packages that Vite's SSR module runner cannot inline.
  // Node loads them natively instead.
  ssr: { external: ["ai", "@ai-sdk/react"] },
});
