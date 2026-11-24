const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const DIGITS = 6;

function encodeBase32(bytes: Uint8Array): string {
	let bits = 0;
	let value = 0;
	let out = "";
	for (const byte of bytes) {
		value = (value << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			out += ALPHABET[(value >>> (bits - 5)) & 31];
			bits -= 5;
		}
	}
	if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
	return out;
}

function decodeBase32(secret: string): Uint8Array | null {
	const cleaned = secret.trim().toUpperCase().replace(/=+$/, "");
	if (!cleaned) return null;
	let bits = 0;
	let value = 0;
	const out: number[] = [];
	for (const char of cleaned) {
		const index = ALPHABET.indexOf(char);
		if (index < 0) return null;
		value = (value << 5) | index;
		bits += 5;
		if (bits >= 8) {
			out.push((value >>> (bits - 8)) & 255);
			bits -= 8;
		}
	}
	return new Uint8Array(out);
}

/** A new authenticator secret. It is shown once, then stored and not returned. */
export function createFactorSecret(): string {
	const bytes = new Uint8Array(20);
	crypto.getRandomValues(bytes);
	return encodeBase32(bytes);
}

async function hotp(secret: Uint8Array, counter: number): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		Buffer.from(secret),
		{ name: "HMAC", hash: "SHA-1" },
		false,
		["sign"],
	);
	const message = new Uint8Array(8);
	let rest = counter;
	for (let index = 7; index >= 0; index -= 1) {
		message[index] = rest & 255;
		rest = Math.floor(rest / 256);
	}
	const signature = new Uint8Array(
		await crypto.subtle.sign("HMAC", key, Buffer.from(message)),
	);
	const offset = (signature[signature.length - 1] ?? 0) & 15;
	const binary =
		((signature[offset] ?? 0) & 127) * 2 ** 24 +
		(signature[offset + 1] ?? 0) * 2 ** 16 +
		(signature[offset + 2] ?? 0) * 2 ** 8 +
		(signature[offset + 3] ?? 0);
	return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

/** The six-digit code for this moment. Callers do not log it. */
export async function totpCode(
	secret: string,
	at: number,
): Promise<string | null> {
	const decoded = decodeBase32(secret);
	if (!decoded) return null;
	const counter = Math.floor(at / 1000 / STEP_SECONDS);
	return hotp(decoded, counter);
}

/** True when the code matches this step or one step either side. */
export async function verifyTotp(
	secret: string,
	code: string,
	at: number,
): Promise<boolean> {
	const trimmed = code.trim();
	if (!/^\d{6}$/.test(trimmed)) return false;
	const decoded = decodeBase32(secret);
	if (!decoded) return false;
	const counter = Math.floor(at / 1000 / STEP_SECONDS);
	for (const step of [counter - 1, counter, counter + 1]) {
		if (step < 0) continue;
		if ((await hotp(decoded, step)) === trimmed) return true;
	}
	return false;
}
