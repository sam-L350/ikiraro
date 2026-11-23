import { describe, expect, test } from "bun:test";
import { isApiError } from "../api/error";
import { badgeRuleMet, requireBadgeRule } from "./badge";
import { storeMediaKey, storeOutboundUrl } from "./media";
import { rubricPasses, weightedScore } from "./rubric";

async function reasonOf(run: () => Promise<unknown>): Promise<string | null> {
	try {
		await run();
		return null;
	} catch (error) {
		if (!isApiError(error)) throw error;
		const details = error.details as { reason?: string } | undefined;
		return details?.reason ?? error.message;
	}
}

describe("rubric pass mark", () => {
	test("a weighted score passes only when every criterion and the task mark are met", () => {
		const criteria = [
			{ weight: 1, passThreshold: 80, score: 100 },
			{ weight: 3, passThreshold: 40, score: 50 },
		];
		expect(weightedScore(criteria)).toBe(63);
		expect(rubricPasses(criteria, 60)).toBe(true);
		expect(rubricPasses(criteria, 70)).toBe(false);
		expect(
			rubricPasses(
				[
					{ weight: 1, passThreshold: 80, score: 100 },
					{ weight: 3, passThreshold: 40, score: 30 },
				],
				60,
			),
		).toBe(false);
	});
});

describe("badge rule", () => {
	const rule = requireBadgeRule({
		allRequiredTasksApproved: true,
		minimumScore: 70,
		minimumHours: 3,
	});

	test("the rule waits for the required tasks, the score, and the hours", () => {
		expect(
			badgeRuleMet(rule, {
				requiredTaskIds: ["page", "ledger"],
				approvedTaskIds: ["page"],
				score: 80,
				hours: 4,
			}),
		).toBe(false);
		expect(
			badgeRuleMet(rule, {
				requiredTaskIds: ["page"],
				approvedTaskIds: ["page"],
				score: 69,
				hours: 4,
			}),
		).toBe(false);
		expect(
			badgeRuleMet(rule, {
				requiredTaskIds: ["page"],
				approvedTaskIds: ["page"],
				score: 70,
				hours: 2,
			}),
		).toBe(false);
		expect(
			badgeRuleMet(rule, {
				requiredTaskIds: ["page"],
				approvedTaskIds: ["page", "optional"],
				score: 70,
				hours: 3,
			}),
		).toBe(true);
	});
});

describe("task media keys", () => {
	test("a key is reserved and a web address or a password is refused", async () => {
		expect(await storeMediaKey("courses/ledger/page.png", "image/*")).toBe(
			"courses/ledger/page.png",
		);
		expect(
			await reasonOf(() =>
				storeMediaKey("https://cdn.example/a.png", "image/*"),
			),
		).toBe("invalid_media_key");
		expect(storeOutboundUrl("https://irembo.gov.rw/home")).toBe(
			"https://irembo.gov.rw/home",
		);
		expect(
			await reasonOf(async () => {
				storeOutboundUrl("https://user:secret@irembo.gov.rw/home");
			}),
		).toBe("invalid_outbound_url");
	});
});
