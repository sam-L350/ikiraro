import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "./demo-accounts";

describe("demo accounts", () => {
	test("the docs list every demo email and the shared password", () => {
		const doc = readFileSync(
			resolve(import.meta.dir, "../../../docs/demo-accounts.md"),
			"utf8",
		);
		expect(doc).toContain(DEMO_PASSWORD);
		for (const account of DEMO_ACCOUNTS) {
			expect(doc).toContain(account.email);
		}
	});
});
