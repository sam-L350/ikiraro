import { sql } from "drizzle-orm";
import {
	check,
	date,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { users } from "./identity";

const clock = sql`clock_timestamp()`;

/** A donated program. Seats and the end date are fixed when it is stored. */
export const softwareLicences = pgTable(
	"software_licences",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		name: text("name").notNull(),
		seats: integer("seats").notNull(),
		expiresOn: date("expires_on", { mode: "string" }).notNull(),
		createdByUserId: integer("created_by_user_id")
			.notNull()
			.references(() => users.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.default(clock),
	},
	(table) => [
		check(
			"software_licences_name",
			sql`char_length(btrim(${table.name})) between 1 and 80`,
		),
		check("software_licences_seats", sql`${table.seats} between 1 and 10000`),
	],
);

/** One person holding one seat. A revocation is a later row. */
export const softwareLicenceGrants = pgTable("software_licence_grants", {
	id: uuid("id").primaryKey().defaultRandom(),
	licenceId: uuid("licence_id")
		.notNull()
		.references(() => softwareLicences.id),
	userId: integer("user_id")
		.notNull()
		.references(() => users.id),
	grantedByUserId: integer("granted_by_user_id")
		.notNull()
		.references(() => users.id),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.default(clock),
});

/** Frees a seat. The grant row stays. */
export const softwareLicenceRevocations = pgTable(
	"software_licence_revocations",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		grantId: uuid("grant_id")
			.notNull()
			.references(() => softwareLicenceGrants.id),
		revokedByUserId: integer("revoked_by_user_id")
			.notNull()
			.references(() => users.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.default(clock),
	},
	(table) => [
		uniqueIndex("software_licence_revocations_grant").on(table.grantId),
	],
);
