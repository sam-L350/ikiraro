import { sql } from "drizzle-orm";
import {
	boolean,
	doublePrecision,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { users } from "./identity";

export const provinces = pgTable("provinces", {
	id: uuid("id").primaryKey().defaultRandom(),
	code: text("code").notNull().unique(),
	name: text("name").notNull(),
	latitude: doublePrecision("latitude"),
	longitude: doublePrecision("longitude"),
});

export const districts = pgTable("districts", {
	id: uuid("id").primaryKey().defaultRandom(),
	provinceId: uuid("province_id")
		.notNull()
		.references(() => provinces.id),
	code: text("code").notNull().unique(),
	name: text("name").notNull(),
	latitude: doublePrecision("latitude"),
	longitude: doublePrecision("longitude"),
});

export const sectors = pgTable("sectors", {
	id: uuid("id").primaryKey().defaultRandom(),
	districtId: uuid("district_id")
		.notNull()
		.references(() => districts.id),
	code: text("code").notNull().unique(),
	name: text("name").notNull(),
	latitude: doublePrecision("latitude"),
	longitude: doublePrecision("longitude"),
});

/** A place where learners train. Coordinates are optional until a center is mapped. */
export const learningCenters = pgTable("learning_centers", {
	id: uuid("id").primaryKey().defaultRandom(),
	sectorId: uuid("sector_id")
		.notNull()
		.references(() => sectors.id),
	name: text("name").notNull(),
	latitude: doublePrecision("latitude"),
	longitude: doublePrecision("longitude"),
	active: boolean("active").notNull().default(true),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

/**
 * Who works at a center. A trainer may appear on several centers.
 * A center has one manager.
 */
export const centerStaff = pgTable(
	"center_staff",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		centerId: uuid("center_id")
			.notNull()
			.references(() => learningCenters.id),
		userId: integer("user_id")
			.notNull()
			.references(() => users.id),
		role: text("role").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		uniqueIndex("center_staff_member_role").on(
			table.centerId,
			table.userId,
			table.role,
		),
		uniqueIndex("center_staff_one_manager")
			.on(table.centerId)
			.where(sql`${table.role} = 'center_manager'`),
	],
);
