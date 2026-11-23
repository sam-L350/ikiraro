import { sql } from "drizzle-orm";

type RlsWriter = {
	execute: (query: ReturnType<typeof sql>) => Promise<unknown>;
};

export type RlsScope = "self" | "staff";

/**
 * Turns the optional policies on for this transaction only.
 * `self` keeps the subject's own submissions, consents, and passport.
 * `staff` is the escape for a review that must read another person's row.
 * Unset, the policies allow the existing queries through.
 */
export async function applyLearnerRls(
	writer: RlsWriter,
	input: { userId: number; scope: RlsScope },
): Promise<void> {
	await writer.execute(sql`select set_config('app.rls', 'on', true)`);
	await writer.execute(
		sql`select set_config('app.user_id', ${String(input.userId)}, true)`,
	);
	await writer.execute(
		sql`select set_config('app.rls_scope', ${input.scope}, true)`,
	);
}
