import { expect, test } from "bun:test";
import { base64ToBytes, bytesToBase64 } from "./bytes";

test("bytes survive a base64 round trip", () => {
	const bytes = new Uint8Array(3000);
	for (let index = 0; index < bytes.length; index += 1) {
		bytes[index] = index % 256;
	}
	expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
});
