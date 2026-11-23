import { describe, expect, test } from "bun:test";
import { isApiError } from "../api/error";
import { cleanInPerson, inPersonRequired } from "./in-person";

describe("in-person verification", () => {
	test("only a badge that asks for a visit requires a place and a past time", () => {
		expect(inPersonRequired(null)).toBe(false);
		expect(inPersonRequired({ badge: null })).toBe(false);
		expect(inPersonRequired({ badge: {} })).toBe(false);
		expect(inPersonRequired({ badge: { requiresInPerson: true } })).toBe(true);
		const now = new Date("2026-11-23T12:00:00.000Z");
		const visit = cleanInPerson(
			{
				location: "  Gitega Learning Center  ",
				observedAt: "2026-11-23T11:00:00.000Z",
			},
			now,
		);
		expect(visit.location).toBe("Gitega Learning Center");
		expect(visit.observedAt.toISOString()).toBe("2026-11-23T11:00:00.000Z");
		expect(() =>
			cleanInPerson(
				{ location: "Gitega", observedAt: "2026-11-23T12:03:00.000Z" },
				now,
			),
		).toThrow(
			expect.objectContaining({
				status: 400,
			}),
		);
	});

	test("a blank place is refused", () => {
		try {
			cleanInPerson(
				{ location: "   ", observedAt: "2026-11-23T11:00:00.000Z" },
				new Date("2026-11-23T12:00:00.000Z"),
			);
			throw new Error("expected a blank place to be refused");
		} catch (error) {
			expect(isApiError(error) && error.details).toEqual({
				reason: "location",
			});
		}
	});
});
