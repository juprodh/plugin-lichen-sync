import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

// Obsidian's review rules, on what the plugin ships and the root files Obsidian reads; Biome does the rest.
export default defineConfig([
	// .gitignore's paths too: ESLint reads no ignore file.
	globalIgnores([
		".jj",
		".direnv",
		"main.js",
		"data.json",
		"tests",
		"packages/*/tests",
		"packages/cli",
		"scripts",
		"knip.config.ts",
	]),
	...obsidianmd.configs.recommended,
	{
		languageOptions: {
			parserOptions: {
				projectService: { allowDefaultProject: ["eslint.config.mjs"] },
			},
		},
	},
]);
