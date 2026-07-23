import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    // Use singlefile only in production to inline everything for the final Electron build
    mode === "production" && viteSingleFile(),
  ].filter(Boolean),
  base: "./", // Needed for Electron file:// protocol
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
}));
