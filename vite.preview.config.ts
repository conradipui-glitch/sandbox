import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// M04 standalone mission preview bundle (single IIFE + CSS), loaded by the
// Studio editor in an iframe. The main site app build is untouched.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist/preview",
    emptyOutDir: true,
    rollupOptions: {
      input: "src/preview/index.html"
    }
  }
});
