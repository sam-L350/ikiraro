import { describe, expect, test } from "bun:test";
import { decideAccess } from "./decide";

describe("decideAccess", () => {
	test("a trainer scoped to center A cannot review center B", () => {
		const decision = decideAccess({
			actorId: "7",
			permission: "submission.review",
			assignments: [
				{ role: "trainer", scopeType: "center", scopeId: "center-a" },
			],
			resource: { centerId: "center-b", ownerId: "9" },
		});
		expect(decision.ok).toBe(false);
	});

	test("the same trainer can review center A", () => {
		const decision = decideAccess({
			actorId: "7",
			permission: "submission.review",
			assignments: [
				{ role: "trainer", scopeType: "center", scopeId: "center-a" },
			],
			resource: { centerId: "center-a", ownerId: "9" },
		});
		expect(decision).toEqual({ ok: true });
	});

	test("a global admin passes a center-scoped resource", () => {
		const decision = decideAccess({
			actorId: "1",
			permission: "admin.manage",
			assignments: [
				{ role: "platform_admin", scopeType: "global", scopeId: null },
			],
			resource: { centerId: "center-b" },
		});
		expect(decision).toEqual({ ok: true });
	});

	test("a center-scoped trainer can read their own profile", () => {
		const decision = decideAccess({
			actorId: "7",
			permission: "profile.read.self",
			assignments: [
				{ role: "trainer", scopeType: "center", scopeId: "center-a" },
			],
			resource: { ownerId: "7" },
		});
		expect(decision).toEqual({ ok: true });
	});

	test("a learner can read only their own profile", () => {
		const own = decideAccess({
			actorId: "4",
			permission: "profile.read.self",
			assignments: [{ role: "learner", scopeType: "self", scopeId: null }],
			resource: { ownerId: "4" },
		});
		const other = decideAccess({
			actorId: "4",
			permission: "profile.read.self",
			assignments: [{ role: "learner", scopeType: "self", scopeId: null }],
			resource: { ownerId: "5" },
		});
		expect(own).toEqual({ ok: true });
		expect(other.ok).toBe(false);
	});

	test("a coordinator scoped to district A cannot manage district B", () => {
		const decision = decideAccess({
			actorId: "3",
			permission: "district.manage",
			assignments: [
				{
					role: "district_coordinator",
					scopeType: "district",
					scopeId: "district-a",
				},
			],
			resource: { districtId: "district-b" },
		});
		expect(decision.ok).toBe(false);
	});

	test("two roles are unioned", () => {
		const decision = decideAccess({
			actorId: "4",
			permission: "submission.review",
			assignments: [
				{ role: "learner", scopeType: "self", scopeId: null },
				{ role: "trainer", scopeType: "district", scopeId: "district-1" },
			],
			resource: { districtId: "district-1", ownerId: "8" },
		});
		expect(decision).toEqual({ ok: true });
	});

	test("a role without the permission is rejected", () => {
		const decision = decideAccess({
			actorId: "4",
			permission: "grant.decide",
			assignments: [{ role: "learner", scopeType: "self", scopeId: null }],
			resource: { ownerId: "4" },
		});
		expect(decision.ok).toBe(false);
	});
});
