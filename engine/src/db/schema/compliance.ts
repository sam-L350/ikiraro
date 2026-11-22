import {
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { users } from "./identity";

/** JSON stored in config and event rows. Kept concrete so the generator can see it later. */
export type JsonValue =
	| string
	| number
	| boolean
	| null
	| JsonValue[]
	| { [key: string]: JsonValue };

export const systemAuditLogs = pgTable("system_audit_logs", {
	id: uuid("id").primaryKey().defaultRandom(),
	actorId: integer("actor_id").references(() => users.id),
	action: text("action").notNull(),
	targetType: text("target_type"),
	targetId: text("target_id"),
	ipAddress: text("ip_address"),
	metadata: jsonb("metadata").$type<JsonValue>(),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

export const domainEvents = pgTable("domain_events", {
	id: uuid("id").primaryKey().defaultRandom(),
	name: text("name").notNull(),
	payload: jsonb("payload").$type<JsonValue>().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	processedAt: timestamp("processed_at", { withTimezone: true }),
	attempts: integer("attempts").notNull().default(0),
});

export const configSettings = pgTable(
	"config_settings",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		key: text("key").notNull(),
		value: jsonb("value").$type<JsonValue>().notNull(),
		version: integer("version").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		uniqueIndex("config_settings_key_version").on(table.key, table.version),
	],
);

export const idempotencyKeys = pgTable(
	"idempotency_keys",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		key: text("key").notNull(),
		actorKey: text("actor_key").notNull(),
		route: text("route").notNull(),
		response: jsonb("response").$type<JsonValue>().notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		uniqueIndex("idempotency_keys_slot").on(
			table.key,
			table.route,
			table.actorKey,
		),
	],
);
