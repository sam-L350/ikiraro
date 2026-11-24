import type { Database } from "../../db";
import { errors } from "../api/error";
import { createVerification } from "./verifications";

type BulkDb = Pick<
	Database,
	"execute" | "insert" | "select" | "transaction" | "update"
>;

const BULK_LIMIT = 20;

function isUuid(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
		value,
	);
}

/**
 * Decide each selected attempt on its own. One failure stops the rest,
 * and the ones already written stay written.
 */
export async function decideBulk(
	database: BulkDb,
	input: {
		reviewerId: number;
		submissionIds: string[];
		decision: string;
		note?: string;
		reasonCode?: string;
		ip: string;
	},
): Promise<{ count: number }> {
	if (input.submissionIds.length === 0) {
		throw errors.badRequest("Choose the work.", { reason: "selection" });
	}
	if (input.submissionIds.length > BULK_LIMIT) {
		throw errors.badRequest("Choose fewer pieces.", { reason: "selection" });
	}
	const seen = new Set<string>();
	for (const id of input.submissionIds) {
		if (!isUuid(id)) throw errors.notFound("That submission was not found.");
		if (seen.has(id)) {
			throw errors.badRequest("Choose each piece once.", {
				reason: "selection",
			});
		}
		seen.add(id);
	}
	if (input.decision !== "approved" && input.decision !== "rejected") {
		throw errors.badRequest("That decision is not one of the choices.", {
			reason: "decision",
		});
	}
	let count = 0;
	for (const submissionId of input.submissionIds) {
		await createVerification(database, {
			reviewerId: input.reviewerId,
			submissionId,
			decision: input.decision,
			note: input.note,
			reasonCode: input.decision === "rejected" ? input.reasonCode : undefined,
			idempotencyKey:
				input.decision === "approved" ? `bulk:${submissionId}` : undefined,
			ip: input.ip,
		});
		count += 1;
	}
	return { count };
}
