import { sql } from "drizzle-orm";
import {
	check,
	date,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import type { JsonValue } from "./compliance";
import { learningCenters } from "./geography";
import { users } from "./identity";

/** An item that can be awarded. Rules live on the row, not in code. */
export const hardwareInventory = pgTable(
	"hardware_inventory",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		name: text("name").notNull(),
		category: text("category").notNull(),
		serial: text("serial").notNull(),
		condition: text("condition").notNull(),
		status: text("status").notNull(),
		centerId: uuid("center_id")
			.notNull()
			.references(() => learningCenters.id),
		donor: text("donor"),
		currentHolderUserId: integer("current_holder_user_id").references(
			() => users.id,
		),
		acquiredOn: date("acquired_on").notNull(),
		criteria: jsonb("criteria").$type<JsonValue>().notNull().default([]),
		createdByUserId: integer("created_by_user_id")
			.notNull()
			.references(() => users.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		uniqueIndex("hardware_inventory_serial").on(table.serial),
		index("hardware_inventory_center").on(table.centerId),
		check(
			"hardware_inventory_name",
			sql`char_length(btrim(${table.name})) between 1 and 120`,
		),
		check(
			"hardware_inventory_category",
			sql`char_length(btrim(${table.category})) between 1 and 60`,
		),
		check(
			"hardware_inventory_serial_len",
			sql`char_length(btrim(${table.serial})) between 1 and 80`,
		),
		check(
			"hardware_inventory_condition",
			sql`${table.condition} in ('good', 'worn', 'damaged')`,
		),
		check(
			"hardware_inventory_status",
			sql`${table.status} in ('in_stock', 'reserved', 'awarded', 'in_repair', 'lost', 'retired')`,
		),
		check(
			"hardware_inventory_donor",
			sql`${table.donor} is null or char_length(btrim(${table.donor})) between 1 and 120`,
		),
	],
);

/** One row each time an item's status or holding center changes. Rows are not edited. */
export const hardwareStatusHistory = pgTable(
	"hardware_status_history",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		inventoryId: uuid("inventory_id")
			.notNull()
			.references(() => hardwareInventory.id),
		status: text("status").notNull(),
		centerId: uuid("center_id")
			.notNull()
			.references(() => learningCenters.id),
		holderUserId: integer("holder_user_id").references(() => users.id),
		note: text("note"),
		recordedByUserId: integer("recorded_by_user_id")
			.notNull()
			.references(() => users.id),
		recordedAt: timestamp("recorded_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index("hardware_status_history_item").on(
			table.inventoryId,
			table.recordedAt,
		),
		check(
			"hardware_status_history_status",
			sql`${table.status} in ('in_stock', 'reserved', 'awarded', 'in_repair', 'lost', 'retired')`,
		),
		check(
			"hardware_status_history_note",
			sql`${table.note} is null or char_length(btrim(${table.note})) between 1 and 200`,
		),
	],
);

/** A repair written by the officer. The row stays. */
export const itemRepairs = pgTable(
	"item_repairs",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		inventoryId: uuid("inventory_id")
			.notNull()
			.references(() => hardwareInventory.id),
		note: text("note").notNull(),
		recordedByUserId: integer("recorded_by_user_id")
			.notNull()
			.references(() => users.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.default(sql`clock_timestamp()`),
	},
	(table) => [
		index("item_repairs_item").on(table.inventoryId, table.createdAt),
		check(
			"item_repairs_note",
			sql`char_length(btrim(${table.note})) between 1 and 500`,
		),
	],
);

/** A warranty end date the officer wrote. A later row replaces it by time. */
export const itemWarranties = pgTable(
	"item_warranties",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		inventoryId: uuid("inventory_id")
			.notNull()
			.references(() => hardwareInventory.id),
		endsOn: date("ends_on").notNull(),
		recordedByUserId: integer("recorded_by_user_id")
			.notNull()
			.references(() => users.id),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.default(sql`clock_timestamp()`),
	},
	(table) => [
		index("item_warranties_item").on(table.inventoryId, table.createdAt),
	],
);
