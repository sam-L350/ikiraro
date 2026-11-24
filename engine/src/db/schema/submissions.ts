import { sql } from "drizzle-orm";
import {
	check,
	doublePrecision,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { contentVersions, tasks } from "./content";
import { users } from "./identity";
import { enrollments } from "./learning";
import { mediaObjects } from "./media";

const submissionStatusSql = sql`'draft', 'pending', 'in_review', 'approved', 'needs_revision', 'rejected', 'escalated', 'withdrawn'`;

/**
 * One attempt at a pinned task. The id is the client's uuid so a retry is the
 * same row. The hash is copied from the private object when the attempt is stored.
 */
export const taskSubmissions = pgTable(
	"task_submissions",
	{
		id: uuid("id").primaryKey(),
		enrollmentId: uuid("enrollment_id")
			.notNull()
			.references(() => enrollments.id),
		taskId: uuid("task_id")
			.notNull()
			.references(() => tasks.id),
		contentVersionId: uuid("content_version_id")
			.notNull()
			.references(() => contentVersions.id),
		ownerUserId: integer("owner_user_id")
			.notNull()
			.references(() => users.id),
		attempt: integer("attempt").notNull(),
		status: text("status").notNull(),
		evidenceType: text("evidence_type").notNull(),
		mediaObjectId: uuid("media_object_id").references(() => mediaObjects.id),
		objectKey: text("object_key"),
		contentHash: text("content_hash"),
		/** none, the same learner, or another learner sent this exact file. */
		duplicateKind: text("duplicate_kind").notNull().default("none"),
		note: text("note"),
		deviceInfo: text("device_info"),
		geoLat: doublePrecision("geo_lat"),
		geoLng: doublePrecision("geo_lng"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		submittedAt: timestamp("submitted_at", { withTimezone: true }),
		/** When this attempt should have been reviewed. Null until it is sent. */
		reviewDueAt: timestamp("review_due_at", { withTimezone: true }),
		/** none, then the center manager, then the district coordinator. */
		escalation: text("escalation").notNull().default("none"),
		withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
	},
	(table) => [
		uniqueIndex("task_submissions_attempt").on(
			table.enrollmentId,
			table.taskId,
			table.attempt,
		),
		uniqueIndex("task_submissions_one_open")
			.on(table.enrollmentId, table.taskId)
			.where(sql`${table.status} in ('draft', 'pending', 'in_review')`),
		index("task_submissions_waiting")
			.on(table.submittedAt)
			.where(sql`${table.status} in ('pending', 'in_review')`),
		index("task_submissions_review_due_idx")
			.on(table.reviewDueAt)
			.where(sql`${table.status} in ('pending', 'in_review')`),
		index("task_submissions_content_hash_idx")
			.on(table.contentHash)
			.where(sql`${table.contentHash} is not null`),
		check(
			"task_submissions_status",
			sql`${table.status} in (${submissionStatusSql})`,
		),
		check("task_submissions_attempt_positive", sql`${table.attempt} > 0`),
		check(
			"task_submissions_evidence",
			sql`${table.evidenceType} in ('photo', 'file', 'note', 'voice')`,
		),
		check(
			"task_submissions_escalation",
			sql`${table.escalation} in ('none', 'manager', 'district')`,
		),
		check(
			"task_submissions_duplicate_kind",
			sql`${table.duplicateKind} in ('none', 'same', 'other')`,
		),
		check(
			"task_submissions_review_due",
			sql`(
				${table.status} = 'draft'
				and ${table.reviewDueAt} is null
				and ${table.escalation} = 'none'
			) or ${table.status} <> 'draft'`,
		),
	],
);
