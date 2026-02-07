import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["src/tests/**/*.test.ts"],
		exclude: ["src/tests/fixtures/**"],
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			lines: 90,
			functions: 90,
			statements: 90,
			branches: 90,
		},
	},
});
