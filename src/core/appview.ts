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
	WikiLichenListWikis,
	WikiLichenSearchWikis,
} from "@lichen-wiki/client/lexicons/index";

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

/** Null when Lichen has no such public wiki. */
export async function getWiki(appview: Client, uri: ResourceUri, viewer?: Did) {
	try {
		return await ok(
			appview.call(WikiLichenGetWiki, {
				params: { uri, ...(viewer ? { viewer } : {}) },
			}),
		);
	} catch (err) {
		if (err instanceof ClientResponseError && err.error === "NotFound") {
			return null;
		}
		throw err;
	}
}

/** Every wiki the DID holds a role on, its own and others'. */
export async function listWikis(appview: Client, did: Did) {
	const { wikis } = await ok(
		appview.call(WikiLichenListWikis, { params: { did } }),
	);
	return wikis;
}

/** Public wikis by name, slug, owner handle and description; the most recently updated when `q` is empty. */
export async function searchWikis(appview: Client, q: string, limit: number) {
	const { wikis } = await ok(
		appview.call(WikiLichenSearchWikis, { params: { q, limit } }),
	);
	return wikis;
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
