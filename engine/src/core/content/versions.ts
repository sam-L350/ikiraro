import { eq, max } from "drizzle-orm";
import type { Database } from "../../db";
import { contentVersions } from "../../db/schema";
import type { JsonValue } from "../../db/schema/compliance";
import { errors } from "../api/error";
import type { CourseView } from "./author";

type VersionDb = Pick<Database, "insert" | "select">;

/** The pinned course a later enrollment will keep. Status lives on the working copy. */
export function publishedSnapshot(course: CourseView): JsonValue {
	return {
		titleEn: course.titleEn,
		titleRw: course.titleRw,
		summaryEn: course.summaryEn,
		summaryRw: course.summaryRw,
		category: course.category,
		economicSector: course.economicSector,
		level: course.level,
		modules: course.modules.map((module) => ({
			id: module.id,
			position: module.position,
			titleEn: module.titleEn,
			titleRw: module.titleRw,
			summaryEn: module.summaryEn,
			summaryRw: module.summaryRw,
			requires: module.requires,
			tasks: module.tasks.map((task) => ({
				id: task.id,
				position: task.position,
				titleEn: task.titleEn,
				titleRw: task.titleRw,
				instructionsEn: task.instructionsEn,
				instructionsRw: task.instructionsRw,
				evidenceType: task.evidenceType,
				passThreshold: task.passThreshold,
				required: task.required,
				imageKey: task.imageKey,
				audioKey: task.audioKey,
				jobAidKey: task.jobAidKey,
				outboundUrl: task.outboundUrl,
				criteria: task.criteria.map((criterion) => ({
					id: criterion.id,
					position: criterion.position,
					weight: criterion.weight,
					passThreshold: criterion.passThreshold,
					promptEn: criterion.promptEn,
					promptRw: criterion.promptRw,
				})),
			})),
		})),
		badge: course.badge
			? {
					id: course.badge.id,
					titleEn: course.badge.titleEn,
					titleRw: course.badge.titleRw,
					skillEn: course.badge.skillEn,
					skillRw: course.badge.skillRw,
					level: course.badge.level,
					validDays: course.badge.validDays,
					requiresInPerson: course.badge.requiresInPerson,
					rule: {
						allRequiredTasksApproved:
							course.badge.rule.allRequiredTasksApproved,
						minimumScore: course.badge.rule.minimumScore,
						minimumHours: course.badge.rule.minimumHours,
					},
				}
			: null,
	};
}

export async function writePublishedVersion(
	database: VersionDb,
	input: { course: CourseView; actorId: number; publishedAt: Date },
): Promise<{ id: string; versionNumber: number }> {
	const [latest] = await database
		.select({ version: max(contentVersions.versionNumber) })
		.from(contentVersions)
		.where(eq(contentVersions.courseId, input.course.id));
	const versionNumber = (latest?.version ?? 0) + 1;
	const [created] = await database
		.insert(contentVersions)
		.values({
			courseId: input.course.id,
			versionNumber,
			snapshot: publishedSnapshot(input.course),
			publishedByUserId: input.actorId,
			publishedAt: input.publishedAt,
		})
		.returning({ id: contentVersions.id });
	if (!created) {
		throw errors.internal("The published version was not stored.");
	}
	return { id: created.id, versionNumber };
}
