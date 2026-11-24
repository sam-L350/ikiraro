import { sql } from "drizzle-orm";
import {
	check,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import type { JsonValue } from "./compliance";
import { hardwareGrants } from "./grants";
import { users } from "./identity";
import { hardwareInventory } from "./inventory";
import { mediaObjects } from "./media";
import { otpChallenges } from "./registration";

/** The form, the acknowledgment, the photo, and the witness. The row is not edited. */
export const handoverRecords = pgTable(
	"handover_records",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		grantId: uuid("grant_id")
			.notNull()
			.references(() => hardwareGrants.id),
		inventoryId: uuid("inventory_id")
			.notNull()
			.references(() => hardwareInventory.id),
		recipientUserId: integer("recipient_user_id")
			.notNull()
			.references(() => users.id),
		witnessUserId: integer("witness_user_id")
			.notNull()
			.references(() => users.id),
		acknowledgment: text("acknowledgment").notNull(),
		signatureMediaId: uuid("signature_media_id").references(
			() => mediaObjects.id,
		),
		otpChallengeId: uuid("otp_challenge_id").references(() => otpChallenges.id),
		photoMediaId: uuid("photo_media_id")
			.notNull()
			.references(() => mediaObjects.id),
		form: jsonb("form").$type<JsonValue>().notNull(),
		recordedByUserId: integer("recorded_by_user_id")
			.notNull()
			.references(() => users.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		uniqueIndex("handover_records_grant").on(table.grantId),
		check(
			"handover_records_ack",
			sql`${table.acknowledgment} in ('signature', 'otp')`,
		),
		check(
			"handover_records_signature",
			sql`(
				${table.acknowledgment} = 'signature'
				and ${table.signatureMediaId} is not null
				and ${table.otpChallengeId} is null
			) or (
				${table.acknowledgment} = 'otp'
				and ${table.otpChallengeId} is not null
				and ${table.signatureMediaId} is null
			)`,
		),
		check(
			"handover_records_photo",
			sql`${table.photoMediaId} is distinct from ${table.signatureMediaId}`,
		),
		check(
			"handover_records_witness",
			sql`${table.witnessUserId} <> ${table.recipientUserId} and ${table.witnessUserId} <> ${table.recordedByUserId}`,
		),
	],
);
