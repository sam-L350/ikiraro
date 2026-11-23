import { base64ToBytes, bytesToBase64 } from "./bytes";

export type Sealed = {
	iv: string;
	box: string;
};

export async function createVaultKey(): Promise<CryptoKey> {
	return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
		"encrypt",
		"decrypt",
	]);
}

export async function exportVaultKey(key: CryptoKey): Promise<string> {
	const raw = await crypto.subtle.exportKey("raw", key);
	return bytesToBase64(new Uint8Array(raw));
}

export async function importVaultKey(encoded: string): Promise<CryptoKey> {
	const bytes = base64ToBytes(encoded);
	const raw = new Uint8Array(bytes.byteLength);
	raw.set(bytes);
	return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
		"encrypt",
		"decrypt",
	]);
}

export async function sealJson(
	key: CryptoKey,
	value: unknown,
): Promise<Sealed> {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const box = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv },
		key,
		new TextEncoder().encode(JSON.stringify(value)),
	);
	return {
		iv: bytesToBase64(iv),
		box: bytesToBase64(new Uint8Array(box)),
	};
}

export async function openJson<T>(key: CryptoKey, sealed: Sealed): Promise<T> {
	const iv = base64ToBytes(sealed.iv);
	const box = base64ToBytes(sealed.box);
	const ivBytes = new Uint8Array(iv.byteLength);
	const boxBytes = new Uint8Array(box.byteLength);
	ivBytes.set(iv);
	boxBytes.set(box);
	const clear = await crypto.subtle.decrypt(
		{ name: "AES-GCM", iv: ivBytes },
		key,
		boxBytes,
	);
	return JSON.parse(new TextDecoder().decode(clear)) as T;
}
