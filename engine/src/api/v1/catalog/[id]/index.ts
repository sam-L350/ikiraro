import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize } from "../../../../core/authz/authorize";
import type { CatalogCourse } from "../../../../core/learning/catalog";
import { readCatalogCourse } from "../../../../core/learning/catalog";
import { db } from "../../../../db";

/** One published course, in the version a new enrollment would pin. */
export async function getCatalogCourse(input: {
	id: string;
}): Promise<CatalogCourse> {
	const user = await requireAuth();
	await authorize({ permission: "learning.read" });
	return readCatalogCourse(db, { userId: user.id, courseId: input.id });
}
