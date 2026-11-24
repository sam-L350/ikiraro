import { isApiError } from "../../../core/api/error";
import { requireAuth } from "../../../core/auth/require-auth";
import { authorize } from "../../../core/authz/authorize";
import {
	type CourseOption,
	type PlacementQuestionView,
	type PlacementSuggestion,
	readPlacement,
} from "../../../core/learning/pathways";
import { db } from "../../../db";

async function canWriteContent(): Promise<boolean> {
	try {
		await authorize({ permission: "content.write" });
		return true;
	} catch (error) {
		if (isApiError(error) && error.status === 403) return false;
		throw error;
	}
}

/** This person's check and the course it suggested. */
export async function getPlacement(): Promise<{
	questions: PlacementQuestionView[];
	suggestion: PlacementSuggestion | null;
	canWrite: boolean;
	courses: CourseOption[];
}> {
	const user = await requireAuth();
	return readPlacement(db, user.id, await canWriteContent());
}
