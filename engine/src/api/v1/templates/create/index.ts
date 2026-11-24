import { requireAuth } from "../../../../core/auth/require-auth";
import { loadAssignments } from "../../../../core/authz/authorize";
import {
	createTemplate,
	type TemplateRow,
} from "../../../../core/coverage/templates";
import { clientIp } from "../../../../core/http/client-ip";
import { db } from "../../../../db";

/** Store a task shape. Using it is a separate step. */
export async function createContentTemplate(input: {
	name: string;
	titleEn: string;
	titleRw?: string;
	instructionsEn?: string;
	instructionsRw?: string;
	evidenceType?: string;
}): Promise<TemplateRow> {
	const user = await requireAuth();
	return createTemplate(db, {
		actorId: user.id,
		assignments: await loadAssignments(user.id),
		name: input.name,
		titleEn: input.titleEn,
		titleRw: input.titleRw,
		instructionsEn: input.instructionsEn,
		instructionsRw: input.instructionsRw,
		evidenceType: input.evidenceType,
		ip: clientIp(),
	});
}
