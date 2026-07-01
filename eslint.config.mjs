import { FlatCompat } from "@eslint/eslintrc";
import eslintConfigPrettier from "eslint-config-prettier";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Next.js standard configs aren't fully native flat configs yet, 
// so we use FlatCompat to translate them properly.
const compat = new FlatCompat({
  baseDirectory: __dirname,
});

/** @type {import("eslint").Linter.Config[]} */
const eslintConfig = [
  // 1. Tell ESLint what globally to ignore (Replaces globalIgnores)
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "node_modules/**"
    ],
  },

  // 2. Extend Next.js Core Web Vitals (includes TS support automatically)
  ...compat.extends("next/core-web-vitals"),

  // 3. TURN OFF all rules that conflict with Prettier. 
  // This MUST be the last item in the array to override previous configs.
  eslintConfigPrettier,
];

export default eslintConfig;