import { requireAuth } from "../../../core/auth/require-auth";
import { loadAssignments } from "../../../core/authz/authorize";
import {
	readTemplates,
	type TemplateRow,
} from "../../../core/coverage/templates";
import { db } from "../../../db";

/** Task templates an author can copy into a draft. */
export async function getContentTemplates(): Promise<{
	templates: TemplateRow[];
}> {
	const user = await requireAuth();
	return readTemplates(db, await loadAssignments(user.id));
}
