// Stands in for @oomfware/eval (tsconfig.json's paths): with no code generation, @atcute/lexicons
// interprets its schemas, and the bundle holds no new Function() for Obsidian's review to flag.
export function create(): never {
	throw new Error("Code generation is off");
}
