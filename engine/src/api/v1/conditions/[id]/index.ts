import { errors } from "../../../../core/api/error";
import { requireAuth } from "../../../../core/auth/require-auth";
import {
	type AwardCondition,
	listOwnConditions,
} from "../../../../core/hardware/recovery";
import { db } from "../../../../db";

/** One grant's conditions, for the recipient. */
export async function getCondition(input: {
	id: string;
}): Promise<AwardCondition> {
	const user = await requireAuth();
	const grants = await listOwnConditions(db, user.id);
	const grant = grants.find((row) => row.id === input.id);
	if (!grant) throw errors.notFound("That grant was not found.");
	return grant;
}
