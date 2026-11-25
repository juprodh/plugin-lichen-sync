import type {} from "@atcute/atproto";
import { Client, ok } from "@atcute/client";
import type { Did } from "@atcute/lexicons/syntax";
import { signedInDid } from "@lichen-wiki/sync/oauth";
import { cliOAuth } from "./login.ts";
import {
	configDir,
	readSessionFile,
	type SessionFile,
} from "./session-file.ts";

type Env = Readonly<Record<string, string | undefined>>;

export interface Account {
	readonly did: Did;
	readonly dir: string;
	readonly file: SessionFile;
}

/** Null when signed out. */
export async function savedAccount(env: Env): Promise<Account | null> {
	const dir = configDir(env);
	const file = await readSessionFile(dir);
	const did = file && signedInDid(file.sessions);
	return file && did ? { did, dir, file } : null;
}

export async function requireAccount(env: Env): Promise<Account> {
	const account = await savedAccount(env);
	if (!account) throw new Error("Not signed in. Run lichen login first.");
	return account;
}

/** The account's PDS, refreshing the session when it is due. */
export async function accountPds(account: Account): Promise<Client> {
	try {
		const session = await cliOAuth(account.dir, account.file).restore(
			account.did,
		);
		return new Client({ handler: session });
	} catch (err) {
		const reason = err instanceof Error ? err.message : String(err);
		throw new Error(`Your session ended. Run lichen login again. (${reason})`);
	}
}

/** Null when the PDS cannot say: the handle is for display, and the DID addresses a wiki as well. */
export async function accountHandle(
	pds: Client,
	did: Did,
): Promise<string | null> {
	try {
		const repo = await ok(
			pds.get("com.atproto.repo.describeRepo", { params: { repo: did } }),
		);
		return repo.handleIsCorrect ? repo.handle : null;
	} catch {
		return null;
	}
}
