import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { copyFileSync, mkdirSync, existsSync, readdirSync } from "fs";

/**
 * Vite config for Chrome Extension (Manifest V3) build.
 *
 * Strategy:
 * - The popup is built as a standard Vite React app (HTML entry)
 * - Service worker and content script are built as separate IIFE bundles
 * - manifest.json and icons are copied to dist/ via a custom plugin
 */

// Custom plugin to copy static extension files to dist/
function copyExtensionFiles() {
  return {
    name: "copy-extension-files",
    writeBundle() {
      const distDir = resolve(__dirname, "dist");

      // Copy manifest.json
      copyFileSync(
        resolve(__dirname, "manifest.json"),
        resolve(distDir, "manifest.json")
      );

      // Copy icons
      const iconsDir = resolve(distDir, "icons");
      if (!existsSync(iconsDir)) mkdirSync(iconsDir, { recursive: true });
      const srcIcons = resolve(__dirname, "public/icons");
      if (existsSync(srcIcons)) {
        readdirSync(srcIcons).forEach((file) => {
          copyFileSync(resolve(srcIcons, file), resolve(iconsDir, file));
        });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), copyExtensionFiles()],
  // Use relative paths — Chrome extensions can't resolve absolute "/" paths
  base: "",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "src/popup/index.html"),
        "service-worker": resolve(
          __dirname,
          "src/background/service-worker.js"
        ),
        content: resolve(__dirname, "src/content/content.js"),
      },
      output: {
        // Chrome MV3 requires predictable file names (no hashes) for
        // service workers and content scripts referenced in manifest.json
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === "popup") return "popup/popup.js";
          return "[name].js";
        },
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: (assetInfo) => {
          // Keep CSS next to the popup
          if (assetInfo.name && assetInfo.name.endsWith(".css")) {
            return "popup/[name][extname]";
          }
          return "assets/[name]-[hash][extname]";
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});
