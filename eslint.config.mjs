// @ts-check
import js from "@eslint/js";
import astro from "eslint-plugin-astro";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    ignores: ["dist/", ".astro/", "node_modules/"],
  },
  js.configs.recommended,
  tseslint.configs.strict,
  astro.configs.recommended,
  {
    files: ["scripts/**/*.mjs", "e2e/**/*.mjs", "*.config.mjs"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
      },
    },
  },
  {
    // End-to-end tests run in Node, but the callbacks passed to
    // page.evaluate() run in the browser.
    files: ["e2e/**/*.mjs"],
    languageOptions: {
      globals: {
        document: "readonly",
        window: "readonly",
      },
    },
  },
  {
    files: ["**/*.astro"],
    rules: {
      // The site ships no JavaScript to the browser (docs/rules/conventions.md).
      // scripts/guard-source.mjs enforces the same rule on the raw source;
      // this rule reports it in the editor as well.
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.namespace.name='client']",
          message: "client:* directives are forbidden: this site ships no JavaScript.",
        },
        {
          selector: "JSXElement[openingElement.name.name='script']",
          message: "<script> is forbidden: this site ships no JavaScript.",
        },
      ],
      "astro/no-set-html-directive": "error",
      "astro/no-unused-css-selector": "error",
    },
  },
);
