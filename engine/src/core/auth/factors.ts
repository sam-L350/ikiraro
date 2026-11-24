import { eq } from "drizzle-orm";
import type { Database } from "../../db";
import { staffFactors } from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit } from "../audit/write";
import type { Assignment } from "../authz/decide";
import { createFactorSecret, verifyTotp } from "./totp";

type FactorDb = Pick<Database, "insert" | "select" | "update">;

export type FactorState = { enabled: boolean };

function requireStaff(assignments: readonly Assignment[]): void {
	const staff = assignments.some((assignment) => assignment.role !== "learner");
	if (!staff) {
		throw errors.forbidden("A staff account can add a second code.", {
			reason: "factor",
		});
	}
}

/** Whether this person has confirmed a second code. The secret stays on the server. */
export async function readFactor(
	database: Pick<Database, "select">,
	userId: number,
): Promise<FactorState> {
	const [row] = await database
		.select({ confirmedAt: staffFactors.confirmedAt })
		.from(staffFactors)
		.where(eq(staffFactors.userId, userId))
		.limit(1);
	return { enabled: row?.confirmedAt != null };
}

/** The stored secret, only for the sign-in check. Never put this on a response. */
export async function confirmedSecret(
	database: Pick<Database, "select">,
	userId: number,
): Promise<string | null> {
	const [row] = await database
		.select({
			secret: staffFactors.secret,
			confirmedAt: staffFactors.confirmedAt,
		})
		.from(staffFactors)
		.where(eq(staffFactors.userId, userId))
		.limit(1);
	if (!row?.confirmedAt) return null;
	return row.secret;
}

/** Start or replace an unconfirmed secret and return it once. */
export async function startFactor(
	database: FactorDb,
	input: { userId: number; assignments: readonly Assignment[]; ip: string },
): Promise<{ secret: string }> {
	requireStaff(input.assignments);
	const [existing] = await database
		.select({ confirmedAt: staffFactors.confirmedAt })
		.from(staffFactors)
		.where(eq(staffFactors.userId, input.userId))
		.limit(1);
	if (existing?.confirmedAt) {
		throw errors.conflict("A second code is already on.", { reason: "factor" });
	}
	const secret = createFactorSecret();
	if (existing) {
		await database
			.update(staffFactors)
			.set({ secret })
			.where(eq(staffFactors.userId, input.userId));
	} else {
		await database.insert(staffFactors).values({
			userId: input.userId,
			secret,
		});
	}
	await writeAudit(database, {
		actorId: input.userId,
		action: "auth.factor_started",
		targetType: "user",
		targetId: String(input.userId),
		ipAddress: input.ip,
	});
	return { secret };
}

/** Confirm the secret with a current code. A blank code is refused. */
export async function confirmFactor(
	database: FactorDb,
	input: { userId: number; code: string; ip: string },
): Promise<FactorState> {
	const code = input.code.trim();
	if (!code) {
		throw errors.badRequest("Enter the second code.", {
			reason: "second_code",
		});
	}
	const [row] = await database
		.select({
			secret: staffFactors.secret,
			confirmedAt: staffFactors.confirmedAt,
		})
		.from(staffFactors)
		.where(eq(staffFactors.userId, input.userId))
		.limit(1);
	if (!row) {
		throw errors.notFound("A second code has not been started.");
	}
	if (row.confirmedAt) {
		throw errors.conflict("A second code is already on.", { reason: "factor" });
	}
	if (!(await verifyTotp(row.secret, code, Date.now()))) {
		throw errors.badRequest("That code is not right.", {
			reason: "wrong_second",
		});
	}
	await database
		.update(staffFactors)
		.set({ confirmedAt: new Date() })
		.where(eq(staffFactors.userId, input.userId));
	await writeAudit(database, {
		actorId: input.userId,
		action: "auth.factor_confirmed",
		targetType: "user",
		targetId: String(input.userId),
		ipAddress: input.ip,
	});
	return { enabled: true };
}
