import { describe, expect, test } from "bun:test";
import {
	PREVIEW_CENTER_ID,
	PREVIEW_DISTRICT_ID,
	previewAssignment,
} from "./preview";

describe("previewAssignment", () => {
	test("a learner is scoped to themselves", () => {
		expect(previewAssignment("learner", 12)).toEqual({
			scopeType: "self",
			scopeId: "12",
		});
	});

	test("a trainer is scoped to the preview center", () => {
		expect(previewAssignment("trainer", 12).scopeId).toBe(PREVIEW_CENTER_ID);
	});

	test("a coordinator is scoped to the preview district", () => {
		expect(previewAssignment("district_coordinator", 12).scopeId).toBe(
			PREVIEW_DISTRICT_ID,
		);
	});

	test("a platform admin is global", () => {
		expect(previewAssignment("platform_admin", 12)).toEqual({
			scopeType: "global",
			scopeId: "global",
		});
	});
});
