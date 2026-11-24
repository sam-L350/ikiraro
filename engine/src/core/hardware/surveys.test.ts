import { describe, expect, test } from "bun:test";
import { surveyChange } from "./surveys";

describe("survey change", () => {
	test("the endline is compared with the stored baseline", () => {
		expect(
			surveyChange(
				{
					digitalConfidence: 2,
					tasksDigital: 1,
					income: 100,
					services: "None yet",
					jobsOrCustomers: 0,
				},
				{
					digitalConfidence: 6,
					tasksDigital: 4,
					income: 250,
					services: "Market payments",
					jobsOrCustomers: 3,
				},
			),
		).toEqual({
			digitalConfidence: 4,
			tasksDigital: 3,
			income: 150,
			jobsOrCustomers: 3,
		});
	});
});
