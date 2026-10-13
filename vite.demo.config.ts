import { defineConfig } from "vite";
import { resolve } from "node:path";

/**
 * The showcase site. Built to `dist-demo/` and published to Cloudflare Pages.
 * It is a plain static bundle so it can be served from any edge host.
 */
export default defineConfig({
  root: resolve(__dirname, "demo"),
  base: "./",
  publicDir: resolve(__dirname, "public"),
  build: {
    outDir: resolve(__dirname, "dist-demo"),
    emptyOutDir: true,
    target: "es2022",
    sourcemap: false,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "demo/index.html"),
      },
    },
  },
});
