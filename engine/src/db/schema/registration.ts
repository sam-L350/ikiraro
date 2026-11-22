import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./identity";

/** Hashed one-time code. The plaintext code is never stored. */
export const otpChallenges = pgTable("otp_challenges", {
	id: uuid("id").primaryKey().defaultRandom(),
	phone: text("phone").notNull(),
	codeHash: text("code_hash").notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	attempts: integer("attempts").notNull().default(0),
	consumedAt: timestamp("consumed_at", { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

/** A new row records a decision. Older rows stay as the history. */
export const consents = pgTable("consents", {
	id: uuid("id").primaryKey().defaultRandom(),
	userId: integer("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	purpose: text("purpose").notNull(),
	version: text("version").notNull(),
	grantedAt: timestamp("granted_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

export const declaredRelationships = pgTable("declared_relationships", {
	id: uuid("id").primaryKey().defaultRandom(),
	userId: integer("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	relatedUserId: integer("related_user_id").references(() => users.id),
	kind: text("kind").notNull(),
	contact: text("contact"),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

/** Empty shell. One passport is created in the same transaction as its user. */
export const digitalPassports = pgTable("digital_passports", {
	id: uuid("id").primaryKey().defaultRandom(),
	userId: integer("user_id")
		.notNull()
		.unique()
		.references(() => users.id, { onDelete: "cascade" }),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});
