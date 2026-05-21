import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/bin.ts"],
  outDir: "dist",
  platform: "node",
  format: "esm",
  dts: true,
  sourcemap: true,
  clean: true,
  fixedExtension: false,
  outputOptions: {
    comments: false,
  },
  minify: {
    codegen: { removeWhitespace: false },
    compress: true,
    mangle: true,
  },
  treeshake: true,
  target: ["node22", "es2024"],
  copy: ["skills"],
  ignoreWatch: [
    ".git",
    ".repo",
    ".direnv",
    ".lalph",
    ".specs",
    ".jj",
    "dist",
    "node_modules",
    "bun.lock",
    "flake.lock",
  ],
});
