/**
 * Runs `fn` once calls pause for as long as `pause` takes. A superseded call resolves to the
 * latest call's result, so a slow early lookup never lands after a later one.
 */
export function debounced<A, T>(
	fn: (arg: A) => Promise<T>,
	pause: () => Promise<void>,
): (arg: A) => Promise<T> {
	let calls = 0;
	let latest: Promise<T> | undefined;
	return (arg) => {
		const call = ++calls;
		const result = (async (): Promise<T> => {
			await pause();
			if (call !== calls && latest) return latest;
			return fn(arg);
		})();
		latest = result;
		return result;
	};
}
