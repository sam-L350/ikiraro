import { requireAuth } from "../../../core/auth/require-auth";
import { authorize } from "../../../core/authz/authorize";
import type { CatalogCourse } from "../../../core/learning/catalog";
import { listCatalog } from "../../../core/learning/catalog";
import { db } from "../../../db";

/** Published courses, in the latest pinned version, filtered for the catalog. */
export async function getCatalog(input: {
	language?: string;
	category?: string;
	sector?: string;
	level?: number;
}): Promise<{ courses: CatalogCourse[] }> {
	const user = await requireAuth();
	await authorize({ permission: "learning.read" });
	return {
		courses: await listCatalog(db, { userId: user.id, filter: input }),
	};
}
