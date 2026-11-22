export interface WaitOptions {
	readonly attempts?: number;
	readonly intervalMs?: number;
	/** The host's timer: core/ also runs where there is no window. */
	readonly sleep: (ms: number) => Promise<void>;
}

/** Asks `probe` until it answers, or null once the attempts ran out. */
export async function pollUntil<T>(
	{ attempts = 15, intervalMs = 1000, sleep }: WaitOptions,
	probe: () => Promise<T | null>,
): Promise<T | null> {
	for (let attempt = 0; attempt < attempts; attempt++) {
		if (attempt > 0) await sleep(intervalMs);
		const answer = await probe();
		if (answer !== null) return answer;
	}
	return null;
}
