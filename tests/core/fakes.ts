import { Client } from "@atcute/client";
import * as v from "@atcute/lexicons/validations";
import { applyDiff } from "@lichen-wiki/client/diff";
import {
	WikiLichenNote,
	WikiLichenNoteRevision,
	WikiLichenNoteSnapshot,
} from "@lichen-wiki/client/lexicons/index";
import type { Vault } from "../../src/core/vault.ts";

export const OWNER = "did:plc:owner";
export const WIKI = `at://${OWNER}/wiki.lichen.wiki/notes` as const;

export interface FakeNote {
	uri: string;
	slug: string;
	title: string;
	content: string;
	head: string;
	/** The head listNotes reports, when it lags behind getNote's. */
	listedHead?: string;
	deleted?: boolean;
}

export const noteUri = (rkey: string) =>
	`at://${OWNER}/wiki.lichen.note/${rkey}` as const;
export const revisionUri = (rkey: string) =>
	`at://${OWNER}/wiki.lichen.noteRevision/${rkey}` as const;

export const fakeNote = (
	rkey: string,
	fields: Partial<FakeNote> = {},
): FakeNote => ({
	uri: noteUri(rkey),
	slug: rkey,
	title: rkey,
	content: `${rkey} body`,
	head: revisionUri(`${rkey}-1`),
	...fields,
});

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
const STAMP = "2026-11-16T00:00:00.000Z";

/** Serves the read queries over `notes`, which tests may change between calls. */
export function fakeAppview(
	notes: FakeNote[],
	{ editors = [] as string[] } = {},
) {
	const fetched: string[] = [];
	const client = new Client({
		handler: async (pathname) => {
			const url = new URL(pathname, "https://appview.test");
			const param = (name: string) => url.searchParams.get(name) ?? "";
			switch (url.pathname) {
				case "/xrpc/wiki.lichen.getWiki":
					return json({
						uri: WIKI,
						did: OWNER,
						slug: "notes",
						name: "Notes",
						description: "",
						language: "en",
						noteCount: notes.length,
						createdAt: STAMP,
						updatedAt: STAMP,
						viewer: {
							did: param("viewer"),
							canWrite: editors.includes(param("viewer")),
						},
					});
				case "/xrpc/wiki.lichen.listNotes":
					return json({
						notes: notes
							.filter((note) => !note.deleted)
							.map((note) => ({
								uri: note.uri,
								slug: note.slug,
								title: note.title,
								latestRevisionUri: note.listedHead ?? note.head,
								updatedAt: STAMP,
							})),
					});
				case "/xrpc/wiki.lichen.getNote": {
					fetched.push(param("uri") || param("slug"));
					const note = notes.find((n) =>
						param("uri") ? n.uri === param("uri") : n.slug === param("slug"),
					);
					if (!note) return json({ error: "NotFound" }, 400);
					if (note.deleted) return json({ error: "NoteDeleted" }, 400);
					return json({
						uri: note.uri,
						wiki: WIKI,
						did: OWNER,
						slug: note.slug,
						title: note.title,
						content: note.content,
						latestRevisionUri: note.head,
						createdAt: STAMP,
						updatedAt: STAMP,
					});
				}
			}
			return json({ error: "MethodNotImplemented" }, 501);
		},
	});
	return { client, fetched };
}

const RECORD_SCHEMAS: Record<string, v.BaseSchema> = {
	"wiki.lichen.note": WikiLichenNote.mainSchema,
	"wiki.lichen.noteRevision": WikiLichenNoteRevision.mainSchema,
	"wiki.lichen.noteSnapshot": WikiLichenNoteSnapshot.mainSchema,
};

interface PdsRecord {
	uri: string;
	collection: string;
	// biome-ignore lint/suspicious/noExplicitAny: a record as the wire carries it
	record: any;
}

/**
 * Takes putRecord and applyWrites creates, refusing a record its lexicon refuses.
 * With `ingest`, records change `notes` as the appview's ingest would.
 */
export function fakePds(notes: FakeNote[], { ingest = true } = {}) {
	const records: PdsRecord[] = [];

	const ingestRevision = ({ uri, record }: PdsRecord, batch: PdsRecord[]) => {
		const note = notes.find((n) => n.uri === record.noteRef);
		if (note && record.parentRevision === note.head) {
			note.content = applyDiff(note.content, record.diff);
			note.head = uri;
			return;
		}
		const created = batch.find((r) => r.uri === record.noteRef)?.record;
		if (!note && created && !notes.some((n) => n.slug === created.slug)) {
			notes.push({
				uri: record.noteRef,
				slug: created.slug,
				title: created.title,
				content: applyDiff("", record.diff),
				head: uri,
			});
		}
	};

	const take = (
		repo: string,
		writes: Omit<PdsRecord, "uri">[],
		rkeys: string[],
	) => {
		const batch = writes.map((write, i) => ({
			...write,
			uri: `at://${repo}/${write.collection}/${rkeys[i]}`,
		}));
		const valid = batch.every((r) => {
			const schema = RECORD_SCHEMAS[r.collection];
			return schema !== undefined && v.safeParse(schema, r.record).ok;
		});
		if (!valid) return false;
		records.push(...batch);
		if (ingest) {
			for (const r of batch) {
				if (r.collection === "wiki.lichen.noteRevision")
					ingestRevision(r, batch);
			}
		}
		return true;
	};

	const client = new Client({
		handler: async (pathname, init) => {
			const input = JSON.parse(String(init.body));
			if (pathname.startsWith("/xrpc/com.atproto.repo.putRecord")) {
				const write = { collection: input.collection, record: input.record };
				if (!take(input.repo, [write], [input.rkey])) {
					return json({ error: "InvalidRecord" }, 400);
				}
				return json({ uri: "at://fake", cid: "bafyfake" });
			}
			if (pathname.startsWith("/xrpc/com.atproto.repo.applyWrites")) {
				const writes = input.writes.map(
					(w: { collection: string; value: unknown }) => ({
						collection: w.collection,
						record: w.value,
					}),
				);
				const rkeys = input.writes.map((w: { rkey: string }) => w.rkey);
				if (!take(input.repo, writes, rkeys)) {
					return json({ error: "InvalidRecord" }, 400);
				}
				return json({});
			}
			return json({ error: "MethodNotImplemented" }, 501);
		},
	});
	return { client, records };
}

export function memoryVault(files: Record<string, string> = {}) {
	const store = new Map(Object.entries(files));
	const vault: Vault = {
		read: async (path) => store.get(path) ?? null,
		write: async (path, content) => {
			store.set(path, content);
		},
		list: async (folder) =>
			[...store.keys()].filter(
				(path) =>
					path.startsWith(folder ? `${folder}/` : "") && path.endsWith(".md"),
			),
	};
	return { vault, files: store };
}
