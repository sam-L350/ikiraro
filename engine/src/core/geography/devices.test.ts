import { describe, expect, test } from "bun:test";
import { deviceIsBookable, slotsOverlap } from "./devices";
import { distanceKm, placeOnMap } from "./directory";

describe("practice devices", () => {
	test("a broken or busy machine cannot be booked", () => {
		expect(
			deviceIsBookable({ condition: "good", availability: "available" }),
		).toBe(true);
		expect(
			deviceIsBookable({ condition: "worn", availability: "available" }),
		).toBe(true);
		expect(
			deviceIsBookable({ condition: "broken", availability: "available" }),
		).toBe(false);
		expect(
			deviceIsBookable({ condition: "good", availability: "in_use" }),
		).toBe(false);
	});

	test("slots overlap only when the times cross", () => {
		const start = Date.parse("2026-11-24T09:00:00.000Z");
		expect(slotsOverlap(start, 60, start + 30 * 60_000, 60)).toBe(true);
		expect(slotsOverlap(start, 60, start + 60 * 60_000, 60)).toBe(false);
	});

	test("a center in Rwanda lands on the map and a far point does not", () => {
		const gitega = placeOnMap(-1.94, 30.06);
		expect(gitega).not.toBeNull();
		expect(gitega?.x).toBeGreaterThan(0);
		expect(gitega?.x).toBeLessThan(1);
		expect(placeOnMap(0, 0)).toBeNull();
		const near = distanceKm(
			{ latitude: -1.94, longitude: 30.06 },
			{ latitude: -1.95, longitude: 30.07 },
		);
		const far = distanceKm(
			{ latitude: -1.94, longitude: 30.06 },
			{ latitude: -2.6, longitude: 29.7 },
		);
		expect(near).toBeLessThan(far);
	});
});
