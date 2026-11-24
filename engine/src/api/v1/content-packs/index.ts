import { requireAuth } from "../../../core/auth/require-auth";
import {
	type ContentPackList,
	listContentPacks,
} from "../../../core/content/packs";
import { db } from "../../../db";

/** Centers and published courses this person can take offline. */
export async function getContentPacks(): Promise<ContentPackList> {
	const user = await requireAuth();
	return listContentPacks(db, user.id);
}
