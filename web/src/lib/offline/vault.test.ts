import { expect, test } from "bun:test";
import { createVaultKey, openJson, sealJson } from "./vault";

test("a sealed note opens only with the same key", async () => {
	const key = await createVaultKey();
	const other = await createVaultKey();
	const sealed = await sealJson(key, { note: "Move closer" });
	expect(await openJson(key, sealed)).toEqual({ note: "Move closer" });
	await expect(openJson(other, sealed)).rejects.toThrow();
});
