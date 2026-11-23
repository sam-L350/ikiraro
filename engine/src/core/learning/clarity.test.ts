import { describe, expect, test } from "bun:test";
import { clarityRating } from "./clarity";

describe("clarity rating", () => {
	test("keeps clear and hard, and drops anything else", () => {
		expect(clarityRating("clear")).toBe("clear");
		expect(clarityRating("hard")).toBe("hard");
		expect(clarityRating("easy")).toBeNull();
	});
});
