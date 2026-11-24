import { requireAuth } from "../../../core/auth/require-auth";
import { type OwnStory, readOwnStory } from "../../../core/impact/stories";
import { getObjectStore } from "../../../core/storage/object-store";
import { db } from "../../../db";

/** This person's story, and whether partners may use it. */
export async function getSuccessStories(): Promise<OwnStory> {
	const user = await requireAuth();
	return readOwnStory(db, getObjectStore(), user.id);
}
