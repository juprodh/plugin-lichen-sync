import type { Did } from "@atcute/lexicons/syntax";
import {
	type Actor,
	type GetJson,
	parseActors,
} from "@lichen-wiki/client/handle-suggest";
import { BSKY_APPVIEW } from "@lichen-wiki/sync/identity";

export async function getProfile(
	getJson: GetJson,
	did: Did,
): Promise<Actor | null> {
	const body = await getJson(
		`${BSKY_APPVIEW}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`,
	);
	return parseActors([body])[0] ?? null;
}
