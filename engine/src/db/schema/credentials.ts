import { sql } from "drizzle-orm";
import {
	check,
	integer,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { earnedBadges } from "./awards";
import { users } from "./identity";

/**
 * The signed record for one awarded badge. A revocation stays on earned_badges.
 * This row is never edited.
 */
export const badgeCredentials = pgTable(
	"badge_credentials",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		earnedBadgeId: uuid("earned_badge_id")
			.notNull()
			.unique()
			.references(() => earnedBadges.id),
		issuer: text("issuer").notNull(),
		verifierUserId: integer("verifier_user_id")
			.notNull()
			.references(() => users.id),
		awardedAt: timestamp("awarded_at", { withTimezone: true }).notNull(),
		contentHash: text("content_hash").notNull(),
		signature: text("signature").notNull(),
		token: text("token").notNull().unique(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		check(
			"badge_credentials_issuer",
			sql`char_length(btrim(${table.issuer})) between 1 and 80`,
		),
		check(
			"badge_credentials_hash",
			sql`${table.contentHash} ~ '^[0-9a-f]{64}$'`,
		),
		check(
			"badge_credentials_signature",
			sql`${table.signature} ~ '^[0-9a-f]{64}$'`,
		),
		check(
			"badge_credentials_token",
			sql`char_length(${table.token}) between 43 and 80`,
		),
	],
);
