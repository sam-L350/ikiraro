import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize } from "../../../../core/authz/authorize";
import {
	type PointCapView,
	createPointCap as publishPointCap,
} from "../../../../core/learning/points";
import { db } from "../../../../db";

/** Publish the next daily and per-type caps. */
export async function createPointCap(input: {
	dailyCap: number;
	photoCap: number;
	fileCap: number;
	noteCap: number;
}): Promise<PointCapView> {
	const user = await requireAuth();
	await authorize({ permission: "admin.manage" });
	return publishPointCap(db, {
		actorId: user.id,
		dailyCap: input.dailyCap,
		photoCap: input.photoCap,
		fileCap: input.fileCap,
		noteCap: input.noteCap,
	});
}
