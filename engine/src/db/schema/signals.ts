import { sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { users } from "./identity";
import { taskSubmissions } from "./submissions";
import { submissionVerifications } from "./verifications";

/** The trainer's writing of a voice note. One transcript per attempt. */
export const voiceTranscripts = pgTable(
	"voice_transcripts",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		submissionId: uuid("submission_id")
			.notNull()
			.references(() => taskSubmissions.id),
		body: text("body").notNull(),
		authorUserId: integer("author_user_id")
			.notNull()
			.references(() => users.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.default(sql`clock_timestamp()`),
	},
	(table) => [
		uniqueIndex("voice_transcripts_submission").on(table.submissionId),
		check(
			"voice_transcripts_body",
			sql`char_length(btrim(${table.body})) between 1 and 2000`,
		),
	],
);

/**
 * Up to three approved pieces on the learner's passport.
 * The gallery shows the task, not the note or the file.
 */
export const showcasePins = pgTable(
	"showcase_pins",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: integer("user_id")
			.notNull()
			.references(() => users.id),
		submissionId: uuid("submission_id")
			.notNull()
			.references(() => taskSubmissions.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.default(sql`clock_timestamp()`),
	},
	(table) => [
		uniqueIndex("showcase_pins_once").on(table.userId, table.submissionId),
		index("showcase_pins_user").on(table.userId, table.createdAt),
	],
);

/** One answer after a first badge, or after one review. */
export const satisfactionPulses = pgTable(
	"satisfaction_pulses",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: integer("user_id")
			.notNull()
			.references(() => users.id),
		moment: text("moment").notNull(),
		verificationId: uuid("verification_id").references(
			() => submissionVerifications.id,
		),
		body: text("body").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.default(sql`clock_timestamp()`),
	},
	(table) => [
		uniqueIndex("satisfaction_pulses_first_badge")
			.on(table.userId)
			.where(sql`${table.moment} = 'first_badge'`),
		uniqueIndex("satisfaction_pulses_review")
			.on(table.userId, table.verificationId)
			.where(sql`${table.moment} = 'review'`),
		check(
			"satisfaction_pulses_moment",
			sql`${table.moment} in ('first_badge', 'review')`,
		),
		check(
			"satisfaction_pulses_moment_target",
			sql`(
				${table.moment} = 'first_badge' and ${table.verificationId} is null
			) or (
				${table.moment} = 'review' and ${table.verificationId} is not null
			)`,
		),
		check(
			"satisfaction_pulses_body",
			sql`char_length(btrim(${table.body})) between 1 and 280`,
		),
	],
);

/** An address that hears when a credential or a grant happens. */
export const partnerWebhooks = pgTable(
	"partner_webhooks",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		url: text("url").notNull(),
		event: text("event").notNull(),
		createdByUserId: integer("created_by_user_id")
			.notNull()
			.references(() => users.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.default(sql`clock_timestamp()`),
	},
	(table) => [
		uniqueIndex("partner_webhooks_url_event").on(table.url, table.event),
		check(
			"partner_webhooks_url",
			sql`char_length(btrim(${table.url})) between 8 and 200`,
		),
		check(
			"partner_webhooks_event",
			sql`${table.event} in ('credential.awarded', 'grant.decided')`,
		),
	],
);

/** A queued notice. sent_at is filled when the send finishes or stops. */
export const webhookDeliveries = pgTable(
	"webhook_deliveries",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		webhookId: uuid("webhook_id")
			.notNull()
			.references(() => partnerWebhooks.id),
		event: text("event").notNull(),
		targetId: text("target_id").notNull(),
		attempts: integer("attempts").notNull().default(0),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.default(sql`clock_timestamp()`),
		sentAt: timestamp("sent_at", { withTimezone: true }),
	},
	(table) => [
		index("webhook_deliveries_unsent").on(table.createdAt),
		check(
			"webhook_deliveries_event",
			sql`${table.event} in ('credential.awarded', 'grant.decided')`,
		),
		check(
			"webhook_deliveries_target",
			sql`char_length(btrim(${table.targetId})) between 1 and 80`,
		),
		check("webhook_deliveries_attempts", sql`${table.attempts} >= 0`),
	],
);
