/** A value the host keeps for the plugin, read at once and saved in the background. */
export interface Saved<T> {
	get(): T;
	save(value: T): Promise<void>;
}
