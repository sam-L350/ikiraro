import { requireAuth } from "../../../../../core/auth/require-auth";
import {
	type Classmate,
	type GroupView,
	readGroup,
} from "../../../../../core/learning/peer";
import { db } from "../../../../../db";

/** The credit rule, the groups, and what each person did. */
export async function getTaskGroup(input: { id: string }): Promise<{
	rule: { ruleEn: string; ruleRw: string } | null;
	groups: GroupView[];
	classmates: Classmate[];
	canWrite: boolean;
}> {
	const user = await requireAuth();
	return readGroup(db, user.id, input.id);
}
