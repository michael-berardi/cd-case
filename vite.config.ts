import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: {
        "cd-case": resolve(__dirname, "src/index.ts"),
        element: resolve(__dirname, "src/element.ts"),
        react: resolve(__dirname, "src/react.tsx"),
      },
      formats: ["es"],
      fileName: (_format, entry) => `${entry}.js`,
    },
    rollupOptions: {
      external: ["three", /^three\//, "react", "react-dom", "react/jsx-runtime"],
      output: {
        preserveModules: false,
      },
    },
  },
});
