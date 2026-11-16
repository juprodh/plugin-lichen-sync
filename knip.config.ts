import type { KnipConfig } from "knip";

const config: KnipConfig = {
	// --production counts only "!" files, so an export only its test calls needs /** @internal */.
	entry: [
		"src/main.ts!",
		// Only tests reach it until the host signs in and has a PDS to push to.
		"src/core/push.ts!",
		"scripts/*.ts",
	],
	project: ["src/**/*.ts!"],
	includeEntryExports: true,
	treatConfigHintsAsErrors: true,
};

export default config;
