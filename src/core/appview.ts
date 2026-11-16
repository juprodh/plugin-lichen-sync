import {
	Client,
	ClientResponseError,
	ok,
	simpleFetchHandler,
} from "@atcute/client";
import type { Did, ResourceUri } from "@atcute/lexicons/syntax";
import {
	WikiLichenGetNote,
	WikiLichenGetWiki,
	WikiLichenListNotes,
} from "@lichen/client/lexicons/index";

const LICHEN_APPVIEW = "https://lichen.wiki";
const PAGE_SIZE = 100;

export function lichenAppview(): Client {
	return new Client({
		handler: simpleFetchHandler({ service: LICHEN_APPVIEW }),
	});
}

// Ingest's own check, so false means ingest would drop the viewer's revisions.
export async function canWrite(
	appview: Client,
	wiki: ResourceUri,
	viewer: Did,
): Promise<boolean> {
	const view = await ok(
		appview.call(WikiLichenGetWiki, { params: { uri: wiki, viewer } }),
	);
	return view.viewer?.canWrite === true;
}

export async function* listNotes(appview: Client, wiki: ResourceUri) {
	let cursor: string | undefined;
	do {
		const page = await ok(
			appview.call(WikiLichenListNotes, {
				params: { wiki, limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) },
			}),
		);
		yield* page.notes;
		cursor = page.cursor;
	} while (cursor);
}

// A deleted note keeps its slug, since slugs are permanent.
export async function isSlugTaken(
	appview: Client,
	wiki: ResourceUri,
	slug: string,
): Promise<boolean> {
	try {
		await ok(appview.call(WikiLichenGetNote, { params: { wiki, slug } }));
		return true;
	} catch (err) {
		if (err instanceof ClientResponseError && err.error === "NoteDeleted") {
			return true;
		}
		if (err instanceof ClientResponseError && err.error === "NotFound") {
			return false;
		}
		throw err;
	}
}

/** Null when the note is deleted or missing. */
export async function getNote(appview: Client, uri: ResourceUri) {
	try {
		return await ok(appview.call(WikiLichenGetNote, { params: { uri } }));
	} catch (err) {
		if (
			err instanceof ClientResponseError &&
			(err.error === "NoteDeleted" || err.error === "NotFound")
		) {
			return null;
		}
		throw err;
	}
}
