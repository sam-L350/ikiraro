import { describe, expect, test } from "bun:test";
import { misconductAccess } from "./access";

const report = {
	reporterUserId: 4,
	reporterCenterIds: ["gitega", "huye"],
	accusedCenterId: "gitega",
	accusedDistrictId: "nyarugenge",
};

describe("misconductAccess", () => {
	test("the reporter can read it and the accused center cannot", () => {
		expect(
			misconductAccess(
				{ userId: 4, centerIds: ["gitega"], admin: false, districtIds: [] },
				report,
			),
		).toBe("own");
		expect(
			misconductAccess(
				{
					userId: 9,
					centerIds: ["gitega"],
					admin: true,
					districtIds: ["nyarugenge"],
				},
				report,
			),
		).toBe("none");
		expect(
			misconductAccess(
				{
					userId: 8,
					centerIds: ["huye"],
					admin: false,
					districtIds: ["nyarugenge"],
				},
				report,
			),
		).toBe("none");
	});

	test("a coordinator outside both centers can read it, and another district cannot", () => {
		expect(
			misconductAccess(
				{
					userId: 3,
					centerIds: [],
					admin: false,
					districtIds: ["nyarugenge"],
				},
				report,
			),
		).toBe("review");
		expect(
			misconductAccess(
				{
					userId: 3,
					centerIds: [],
					admin: false,
					districtIds: ["huye-district"],
				},
				report,
			),
		).toBe("none");
		expect(
			misconductAccess(
				{ userId: 1, centerIds: [], admin: true, districtIds: [] },
				report,
			),
		).toBe("review");
	});
});
