import { errors } from "../../../core/api/error";
import { requireAuth } from "../../../core/auth/require-auth";
import { authorize, loadAssignments } from "../../../core/authz/authorize";
import { reviewCenters } from "../../../core/learning/review-queue";
import {
	loadQuality,
	overseesTrainers,
	type QualityReport,
} from "../../../core/learning/second-review";
import { db } from "../../../db";

/** Trainer quality for the centers this person covers, or their own decisions. */
export async function getQuality(): Promise<QualityReport> {
	const user = await requireAuth();
	const assignments = await loadAssignments(user.id);
	const oversight = overseesTrainers(assignments.map((row) => row.role));
	const globalAdmin = assignments.some(
		(row) => row.role === "platform_admin" && row.scopeType === "global",
	);
	if (globalAdmin) {
		await authorize({ permission: "admin.manage" });
		return loadQuality(db, {
			viewerId: user.id,
			centerIds: "all",
			selfOnly: false,
			anomalies: true,
		});
	}
	const centers = await reviewCenters(db, user.id);
	const first = centers[0];
	if (!first) {
		await authorize({
			permission: "submission.review",
			resource: { ownerId: String(user.id) },
		});
		throw errors.forbidden("You do not review evidence for a center.");
	}
	await authorize({
		permission: "submission.review",
		resource: { centerId: first.id, districtId: first.districtId },
	});
	return loadQuality(db, {
		viewerId: user.id,
		centerIds: centers.map((center) => center.id),
		selfOnly: !oversight,
		anomalies: oversight,
	});
}
