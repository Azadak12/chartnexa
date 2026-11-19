import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.turbo/**",
      "**/generated/**",
      "**/.expo/**",
      "openspec/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // React rules for the mobile app: hooks must be used correctly.
    files: ["apps/mobile/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    // CommonJS Node files that Jest loads (test server launcher and config).
    files: ["apps/mobile/__contract__/*.js", "apps/mobile/jest.contract.config.js"],
    languageOptions: {
      globals: {
        require: "readonly",
        module: "readonly",
        process: "readonly",
        console: "readonly",
        __dirname: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
      },
    },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    // Node build scripts.
    files: ["apps/mobile/scripts/**/*.mjs"],
    languageOptions: { globals: { console: "readonly", process: "readonly" } },
  },
  {
    // Operations tools run on Node directly.
    files: ["tools/**/*.mjs", "apps/api/demo-assets/generate/**/*.mjs"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        fetch: "readonly",
        setTimeout: "readonly",
      },
    },
  },
  {
    // The Jest setup file uses Jest globals.
    files: ["apps/mobile/jest.setup.js"],
    languageOptions: { globals: { jest: "readonly", require: "readonly" } },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
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
  // Inside a module, never reach into a sibling module's internals (only its index.js).
  // Shared infrastructure outside modules/ (config, database, platform) is allowed.
  ...[
    { files: "apps/api/src/modules/*/*.ts", ups: 1 },
    { files: "apps/api/src/modules/*/*/*.ts", ups: 2 },
    { files: "apps/api/src/modules/*/*/*/*.ts", ups: 3 },
  ].map(({ files, ups }) => ({
    files: [files],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: `^(\\.\\./){${ups}}(?!\\.)[^/]+/(?!index\\.js$).+$`,
              message: "Modules may not import another module's internals; use its index.js.",
            },
          ],
        },
      ],
    },
  })),
);
