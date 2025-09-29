import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile"; // ← ИМЕНОВАННЫЙ импорт

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: "./",
  resolve: { alias: { "@": "/src" } },
  build: {
    outDir: "docs",
    target: "es2019",
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    sourcemap: false,
  },
});
