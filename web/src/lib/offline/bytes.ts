/** JSON-safe bytes. Phase 6.3 persists this encoding with the queue payload. */
export function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	const chunk = 0x8000;
	for (let index = 0; index < bytes.length; index += chunk) {
		const slice = bytes.subarray(index, index + chunk);
		binary += String.fromCharCode(...slice);
	}
	return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
	const binary = atob(value);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return bytes;
}

export async function blobToBase64(blob: Blob): Promise<string> {
	return bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
}
