import { asRecord, stringField } from "./json.ts";

export interface Settings {
	/** The wiki owner's handle or DID. */
	readonly owner: string;
	/** Also names the wiki's vault folder. */
	readonly wikiSlug: string;
	/** The handle or DID last used to sign in. */
	readonly account: string;
}

export function parseSettings(data: unknown): Settings {
	const raw = asRecord(data);
	return {
		owner: stringField(raw, "owner"),
		wikiSlug: stringField(raw, "wikiSlug"),
		account: stringField(raw, "account"),
	};
}
