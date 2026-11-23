import { describe, expect, test } from "bun:test";
import { duplicateKind, raisedKind } from "./duplicates";

describe("content hash duplicates", () => {
	test("another learner's copy is the flag, and a waiting copy is only raised", () => {
		expect(duplicateKind(1, [])).toBe("none");
		expect(duplicateKind(1, [{ ownerUserId: 1 }])).toBe("same");
		expect(duplicateKind(1, [{ ownerUserId: 1 }, { ownerUserId: 2 }])).toBe(
			"other",
		);
		expect(raisedKind("none", 1, 1)).toBe("same");
		expect(raisedKind("same", 1, 1)).toBe("same");
		expect(raisedKind("none", 1, 2)).toBe("other");
		expect(raisedKind("other", 2, 2)).toBe("other");
	});
});
