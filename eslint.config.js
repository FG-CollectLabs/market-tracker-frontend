// Lint for the bugs the type checker can't see. Kept to the React hooks
// rules: a hook after an early return crashed the Watchlist page
// ("Rendered more hooks than during the previous render") and passed
// `tsc` and the build. The deploy runs `npm run lint` before building.
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  { ignores: ["dist", "node_modules"] },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { parser: tseslint.parser },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
);
