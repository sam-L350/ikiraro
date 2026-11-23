import { env } from "../../config/env";
import { db } from "../../db";
import type { RequestContext } from "../api/context";
import { applyCorsHeaders } from "../http/cors";
import { readMaxBytes } from "./max-bytes";
import { getObjectStore } from "./object-store";
import { sniffContentType } from "./sniff";
import { readMediaToken } from "./token";

function json(
	context: RequestContext,
	status: number,
	body: unknown,
): Response {
	const headers = new Headers({ "content-type": "application/json" });
	headers.set("x-request-id", context.requestId);
	applyCorsHeaders(headers, context.request.headers.get("origin"));
	return new Response(JSON.stringify(body), { status, headers });
}

function tokenFrom(request: Request): string | null {
	const token = new URL(request.url).searchParams.get("token");
	return token && token.length > 0 ? token : null;
}

/** Accept bytes only when the signed upload token is still valid. */
export async function putPrivateMedia(
	context: RequestContext,
): Promise<Response> {
	const token = tokenFrom(context.request);
	const media = token ? readMediaToken(token, env.otpPepper, Date.now()) : null;
	if (!token || !media || media.method !== "PUT") {
		return json(context, 401, {
			error: { code: "UNAUTHORIZED", message: "That upload link has expired." },
		});
	}
	const declared = context.request.headers.get("content-type") ?? "";
	if (declared.split(";")[0]?.trim() !== media.contentType) {
		return json(context, 400, {
			error: { code: "BAD_REQUEST", message: "The file type does not match." },
		});
	}
	const bytes = new Uint8Array(await context.request.arrayBuffer());
	const maxBytes = await readMaxBytes(db);
	if (bytes.byteLength === 0 || bytes.byteLength > maxBytes) {
		return json(context, 413, {
			error: { code: "PAYLOAD_TOO_LARGE", message: "That file is too large." },
		});
	}
	await getObjectStore().put({
		key: media.key,
		contentType: media.contentType,
		bytes,
	});
	const headers = new Headers();
	headers.set("x-request-id", context.requestId);
	applyCorsHeaders(headers, context.request.headers.get("origin"));
	return new Response(null, { status: 204, headers });
}

/** Return the bytes only for a signed read token. The link expires in minutes. */
export async function getPrivateMedia(
	context: RequestContext,
): Promise<Response> {
	const token = tokenFrom(context.request);
	const media = token ? readMediaToken(token, env.otpPepper, Date.now()) : null;
	if (!token || !media || media.method !== "GET") {
		return json(context, 401, {
			error: { code: "UNAUTHORIZED", message: "That link has expired." },
		});
	}
	const stored = await getObjectStore().read(media.key);
	if (!stored) {
		return json(context, 404, {
			error: { code: "NOT_FOUND", message: "That file was not found." },
		});
	}
	const sniffed = sniffContentType(stored.bytes);
	if (!sniffed) {
		return json(context, 415, {
			error: {
				code: "UNSUPPORTED_MEDIA_TYPE",
				message: "That file was refused.",
			},
		});
	}
	const headers = new Headers({
		"content-type": sniffed,
		"cache-control": "private, no-store",
		"x-content-type-options": "nosniff",
		"content-disposition":
			sniffed === "application/pdf" ? "attachment" : "inline",
	});
	headers.set("x-request-id", context.requestId);
	applyCorsHeaders(headers, context.request.headers.get("origin"));
	return new Response(Buffer.from(stored.bytes), { status: 200, headers });
}
