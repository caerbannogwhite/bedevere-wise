import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig(({ command, mode }) => {
  // GitHub Pages serves from /bedevere-wise/; dev stays at /
  const base = command === "build" ? "/bedevere-wise/" : "/";

  return {
    base,
    resolve: {
      alias: {
        "@": resolve(__dirname, "./src"),
      },
    },
    server: {
      port: 3000,
      open: true,
    },
    build: {
      outDir: "dist",
      sourcemap: true,
      target: "esnext",
      rollupOptions: {
        input: {
          main: resolve(__dirname, "index.html"),
        },
      },
    },
  };
});
