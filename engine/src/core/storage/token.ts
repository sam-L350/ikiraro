import { createHmac, timingSafeEqual } from "node:crypto";

export type MediaToken = {
	key: string;
	method: "GET" | "PUT";
	contentType: string;
	exp: number;
};

function encode(value: string): string {
	return Buffer.from(value, "utf8").toString("base64url");
}

function decode(value: string): string {
	return Buffer.from(value, "base64url").toString("utf8");
}

function sign(body: string, secret: string): string {
	return createHmac("sha256", secret).update(body).digest("base64url");
}

/** A short-lived token for one object and one method. It is not a public link. */
export function issueMediaToken(token: MediaToken, secret: string): string {
	const body = encode(JSON.stringify(token));
	return `${body}.${sign(body, secret)}`;
}

export function readMediaToken(
	value: string,
	secret: string,
	now: number,
): MediaToken | null {
	const split = value.split(".");
	if (split.length !== 2) return null;
	const [body, signature] = split;
	if (!body || !signature) return null;
	const expected = sign(body, secret);
	const left = Buffer.from(signature);
	const right = Buffer.from(expected);
	if (left.length !== right.length || !timingSafeEqual(left, right))
		return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(decode(body));
	} catch {
		return null;
	}
	if (!parsed || typeof parsed !== "object") return null;
	const record = parsed as Record<string, unknown>;
	if (typeof record.key !== "string" || record.key.length === 0) return null;
	if (record.method !== "GET" && record.method !== "PUT") return null;
	if (typeof record.contentType !== "string") return null;
	if (typeof record.exp !== "number" || record.exp <= now) return null;
	return {
		key: record.key,
		method: record.method,
		contentType: record.contentType,
		exp: record.exp,
	};
}
