import { describe, expect, test } from "bun:test";
import { auditCsv } from "./csv";

describe("auditCsv", () => {
	test("a formula and a comma stay inside one cell", () => {
		const csv = auditCsv([
			{
				action: "=cmd",
				actorId: 4,
				actorName: "Ada, N.",
				targetType: "user",
				targetId: "4",
				createdAt: "2026-11-23T00:00:00.000Z",
			},
		]);
		expect(csv).toContain("created_at,action,actor_id");
		expect(csv).toContain("'=cmd");
		expect(csv).toContain('"Ada, N."');
	});
});
