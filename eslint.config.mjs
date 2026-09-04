// Root ESLint config: applies to the pure-TS workspace packages.
// apps/web carries its own eslint-config-next setup.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: ["**/node_modules/**", "apps/**", "e2e/**", "**/dist/**", "**/.next/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];
