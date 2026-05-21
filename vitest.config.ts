import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.repo/**",
      "**/.direnv/**",
      "**/.lalph/**",
      "**/.specs/**",
      "**/.jj/**",
      "**/.{idea,git,cache,output,temp}/**",
    ],
  },
});
