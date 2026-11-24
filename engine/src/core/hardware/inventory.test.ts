import { describe, expect, test } from "bun:test";
import { isApiError } from "../api/error";
import { evaluateItem, parseItemCriteria } from "./inventory";

const user = {
	points: 0,
	badgeIds: [] as string[],
	verifiedMinutes: 0,
	districtId: null,
	registeredAt: new Date("2026-01-01T00:00:00.000Z"),
	asOf: new Date("2026-06-01T00:00:00.000Z"),
};

describe("item rules", () => {
	test("an item passes or fails only the rules it stores", () => {
		expect(parseItemCriteria([])).toEqual([]);
		expect(evaluateItem(user, [])).toEqual([]);
		const rules = parseItemCriteria([{ kind: "points", minimum: 5 }]);
		expect(evaluateItem(user, rules)[0]?.status).toBe("fail");
		expect(evaluateItem({ ...user, points: 5 }, rules)[0]?.status).toBe("pass");
	});

	test("a rule without its number is refused", () => {
		try {
			parseItemCriteria([{ kind: "points" }]);
		} catch (error) {
			expect(isApiError(error) && error.status).toBe(400);
			return;
		}
		throw new Error("expected a refusal");
	});
});
