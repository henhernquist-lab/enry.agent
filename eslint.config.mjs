import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      // GLM's config disabled "react-hooks/impure-react", which is NOT a real
      // rule (eslint tolerates disabling unknown rules, so it was a silent
      // no-op). The real impure-render guardrail — the Date.now()-in-render
      // hydration-mismatch class that's bitten this project — is "purity".
      // Kept at warn so new slips surface without failing lint.
      "react-hooks/purity": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
