import { describe, expect, test } from "bun:test";
import { normalizeRwandanPhone } from "./phone";

describe("normalizeRwandanPhone", () => {
	test("accepts local, country, and spaced forms", () => {
		expect(normalizeRwandanPhone("0788123456")).toBe("250788123456");
		expect(normalizeRwandanPhone("+250 788 123 456")).toBe("250788123456");
		expect(normalizeRwandanPhone("250788123456")).toBe("250788123456");
	});

	test("rejects numbers that are not Rwandan mobiles", () => {
		expect(normalizeRwandanPhone("12345")).toBeNull();
		expect(normalizeRwandanPhone("0612345678")).toBeNull();
	});
});
