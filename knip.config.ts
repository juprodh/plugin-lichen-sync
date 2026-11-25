import type { KnipConfig } from "knip";

const config: KnipConfig = {
	// --production counts only "!" files, so an export only its test calls needs /** @internal */.
	workspaces: {
		".": {
			entry: ["src/main.ts!", "scripts/*.ts"],
			project: ["src/**/*.ts!"],
			// tsconfig.json's paths load it in place of a package, which knip cannot follow.
			ignore: ["src/no-eval.ts"],
		},
		"packages/sync": {
			entry: ["src/*.ts!"],
			project: ["src/**/*.ts!"],
		},
		"packages/cli": {
			entry: ["src/main.ts!"],
			project: ["src/**/*.ts!"],
		},
	},
	includeEntryExports: true,
	treatConfigHintsAsErrors: true,
};

export default config;
