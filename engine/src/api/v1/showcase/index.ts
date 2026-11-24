import { requireAuth } from "../../../core/auth/require-auth";
import {
	readShowcase,
	type ShowcaseItem,
} from "../../../core/learning/showcase";
import { getObjectStore } from "../../../core/storage/object-store";
import { db } from "../../../db";

/** Pinned work, and approved work that is not pinned yet. */
export async function getShowcase(): Promise<{
	pins: ShowcaseItem[];
	open: ShowcaseItem[];
}> {
	const user = await requireAuth();
	return readShowcase(db, getObjectStore(), user.id);
}
