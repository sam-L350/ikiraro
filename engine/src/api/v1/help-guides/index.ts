import { requireAuth } from "../../../core/auth/require-auth";
import {
	type HelpGuideView,
	listHelpGuides,
} from "../../../core/support/guides";
import { db } from "../../../db";

/** Search the guides. A blank query returns the latest ones. */
export async function getHelpGuides(input: {
	q?: string;
}): Promise<{ guides: HelpGuideView[]; canWrite: boolean }> {
	const user = await requireAuth();
	return listHelpGuides(db, { userId: user.id, q: input.q });
}
