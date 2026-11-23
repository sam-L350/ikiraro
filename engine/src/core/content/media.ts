import { errors } from "../api/error";
import { objectStore } from "../storage/object-store";

const MEDIA_KEY = /^[a-z0-9][a-z0-9/_.-]{0,199}$/i;

function clean(value: string | undefined): string {
	return (value ?? "").trim();
}

/** Accept a storage key and reserve it. A web address is not a key. */
export async function storeMediaKey(
	value: string | undefined,
	contentType: string,
): Promise<string | null> {
	const key = clean(value);
	if (!key) return null;
	if (!MEDIA_KEY.test(key) || key.includes("..")) {
		throw errors.badRequest("Use a storage key, not a web address.", {
			reason: "invalid_media_key",
		});
	}
	const reserved = await objectStore.reserve({ key, contentType });
	return reserved.key;
}

/** Keep a practice link. Userinfo would be a password, so it is refused. */
export function storeOutboundUrl(value: string | undefined): string | null {
	const raw = clean(value);
	if (!raw) return null;
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		throw errors.badRequest("Enter a web address without a password.", {
			reason: "invalid_outbound_url",
		});
	}
	const protocol = url.protocol;
	switch (protocol) {
		case "https:":
		case "http:":
			break;
		default:
			throw errors.badRequest("Enter a web address without a password.", {
				reason: "invalid_outbound_url",
			});
	}
	if (url.username.length > 0 || url.password.length > 0) {
		throw errors.badRequest("Enter a web address without a password.", {
			reason: "invalid_outbound_url",
		});
	}
	return url.toString();
}
