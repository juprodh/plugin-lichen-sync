export function asRecord(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

export function stringField(raw: Record<string, unknown>, key: string): string {
	const value = raw[key];
	return typeof value === "string" ? value : "";
}
