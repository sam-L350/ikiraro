import { sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { learningCenters } from "./geography";
import { users } from "./identity";

/** A practice machine at a center. This is not a device awarded to a learner. */
export const devices = pgTable(
	"devices",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		centerId: uuid("center_id")
			.notNull()
			.references(() => learningCenters.id),
		kind: text("kind").notNull(),
		label: text("label").notNull(),
		condition: text("condition").notNull(),
		availability: text("availability").notNull(),
		createdByUserId: integer("created_by_user_id")
			.notNull()
			.references(() => users.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index("devices_center").on(table.centerId),
		check(
			"devices_kind",
			sql`${table.kind} in ('computer', 'tablet', 'router')`,
		),
		check(
			"devices_label",
			sql`char_length(btrim(${table.label})) between 1 and 80`,
		),
		check(
			"devices_condition",
			sql`${table.condition} in ('good', 'worn', 'broken')`,
		),
		check(
			"devices_availability",
			sql`${table.availability} in ('available', 'in_use', 'unavailable')`,
		),
	],
);

/** A learner's reserved time on one practice machine. The id comes from the client. */
export const deviceBookings = pgTable(
	"device_bookings",
	{
		id: uuid("id").primaryKey(),
		deviceId: uuid("device_id")
			.notNull()
			.references(() => devices.id),
		learnerUserId: integer("learner_user_id")
			.notNull()
			.references(() => users.id),
		startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
		minutes: integer("minutes").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index("device_bookings_device_start").on(table.deviceId, table.startsAt),
		check("device_bookings_minutes", sql`${table.minutes} between 30 and 180`),
	],
);
