import { isApiError } from "../../../core/api/error";
import { requireAuth } from "../../../core/auth/require-auth";
import { authorize } from "../../../core/authz/authorize";
import {
	type CourseOption,
	type PathwayView,
	readPathways,
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

/** Ordered pathways, and the next course this person has not finished. */
export async function getPathways(): Promise<{
	pathways: PathwayView[];
	canWrite: boolean;
	courses: CourseOption[];
}> {
	const user = await requireAuth();
	return readPathways(db, user.id, await canWriteContent());
}
