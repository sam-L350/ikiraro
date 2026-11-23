import { describe, expect, test } from "bun:test";
import { auditActionVisible, auditScope } from "./scope";

describe("auditScope", () => {
	test("an auditor sees every row and a center manager sees that center", () => {
		expect(
			auditScope([{ role: "auditor", scopeType: "global", scopeId: null }]),
		).toEqual({ kind: "all" });
		expect(
			auditScope([
				{
					role: "center_manager",
					scopeType: "center",
					scopeId: "center-a",
				},
				{ role: "trainer", scopeType: "center", scopeId: "center-b" },
			]),
		).toEqual({
			kind: "limited",
			centerIds: ["center-a"],
			districtIds: [],
		});
	});

	test("a center list hides a concern and a global list keeps it", () => {
		const limited = {
			kind: "limited" as const,
			centerIds: ["center-a"],
			districtIds: [],
		};
		expect(auditActionVisible(limited, "misconduct.filed")).toBe(false);
		expect(auditActionVisible({ kind: "all" }, "misconduct.filed")).toBe(true);
		expect(auditActionVisible(limited, "account.deactivated")).toBe(true);
	});

	test("a trainer has no audit scope", () => {
		expect(
			auditScope([
				{ role: "trainer", scopeType: "center", scopeId: "center-a" },
			]),
		).toEqual({ kind: "limited", centerIds: [], districtIds: [] });
	});
});
