import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/.turbo/**", "**/generated/**", "openspec/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Module boundaries: other code may import a domain module only through its index.
    files: ["apps/api/src/**/*.ts"],
    ignores: ["apps/api/src/modules/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/modules/*/*", "!**/modules/*/index.js"],
              message: "Import a domain module only through its index.js.",
            },
          ],
        },
      ],
    },
  },
  {
    // Inside a module, never reach into a sibling module.
    files: ["apps/api/src/modules/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../../*/**", "!../../*/index.js"],
              message: "Modules may not import another module's internals; use its index.js.",
            },
          ],
        },
      ],
    },
  },
);
