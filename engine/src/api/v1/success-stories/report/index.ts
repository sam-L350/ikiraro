import { requireAuth } from "../../../../core/auth/require-auth";
import { loadAssignments } from "../../../../core/authz/authorize";
import {
	type PartnerStory,
	readPartnerStories,
} from "../../../../core/impact/stories";
import { getObjectStore } from "../../../../core/storage/object-store";
import { db } from "../../../../db";

/** Consented stories inside this person's scope. */
export async function getSuccessStoryReport(): Promise<{
	stories: PartnerStory[];
}> {
	const user = await requireAuth();
	return readPartnerStories(
		db,
		getObjectStore(),
		await loadAssignments(user.id),
	);
}
