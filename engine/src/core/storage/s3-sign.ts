import { createHash, createHmac } from "node:crypto";

export type SignInput = {
	method: "GET" | "PUT" | "HEAD" | "DELETE";
	endpoint: string;
	bucket: string;
	key: string;
	accessKeyId: string;
	secretAccessKey: string;
	region: string;
	now: Date;
	expiresInSeconds: number;
	contentType?: string;
};

function encode(value: string): string {
	return encodeURIComponent(value).replace(
		/[!'()*]/g,
		(char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
	);
}

function hmac(key: Buffer | string, value: string): Buffer {
	return createHmac("sha256", key).update(value).digest();
}

function stamp(date: Date): { amz: string; day: string } {
	const amz = date
		.toISOString()
		.replace(/[-:]/g, "")
		.replace(/\.\d{3}Z$/, "Z");
	return { amz, day: amz.slice(0, 8) };
}

/** A presigned S3 URL. The bucket stays private: there is no public ACL. */
export function presignS3Url(input: SignInput): string {
	const endpoint = new URL(input.endpoint);
	const { amz, day } = stamp(input.now);
	const scope = `${day}/${input.region}/s3/aws4_request`;
	const credential = `${input.accessKeyId}/${scope}`;
	const signedHeaders = input.contentType ? "content-type;host" : "host";
	const query: [string, string][] = [
		["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
		["X-Amz-Credential", credential],
		["X-Amz-Date", amz],
		["X-Amz-Expires", String(input.expiresInSeconds)],
		["X-Amz-SignedHeaders", signedHeaders],
	];
	query.sort((left, right) => (left[0] < right[0] ? -1 : 1));
	const canonicalQuery = query
		.map(([key, value]) => `${encode(key)}=${encode(value)}`)
		.join("&");
	const canonicalUri = `/${encode(input.bucket)}/${input.key
		.split("/")
		.map(encode)
		.join("/")}`;
	const headerLines = input.contentType
		? `content-type:${input.contentType}\nhost:${endpoint.host}\n`
		: `host:${endpoint.host}\n`;
	const canonical = [
		input.method,
		canonicalUri,
		canonicalQuery,
		headerLines,
		signedHeaders,
		"UNSIGNED-PAYLOAD",
	].join("\n");
	const stringToSign = [
		"AWS4-HMAC-SHA256",
		amz,
		scope,
		createHash("sha256").update(canonical).digest("hex"),
	].join("\n");
	const signingKey = hmac(
		hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, day), input.region), "s3"),
		"aws4_request",
	);
	const signature = createHmac("sha256", signingKey)
		.update(stringToSign)
		.digest("hex");
	return `${endpoint.origin}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}
