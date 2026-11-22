import {
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { users } from "./identity";

export const roles = pgTable("roles", {
	id: uuid("id").primaryKey().defaultRandom(),
	code: text("code").notNull().unique(),
	name: text("name").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

export const permissions = pgTable("permissions", {
	id: uuid("id").primaryKey().defaultRandom(),
	code: text("code").notNull().unique(),
	description: text("description").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

export const rolePermissions = pgTable(
	"role_permissions",
	{
		roleId: uuid("role_id")
			.notNull()
			.references(() => roles.id, { onDelete: "cascade" }),
		permissionId: uuid("permission_id")
			.notNull()
			.references(() => permissions.id, { onDelete: "cascade" }),
	},
	(table) => [
		uniqueIndex("role_permissions_pair").on(table.roleId, table.permissionId),
	],
);

export const userRoles = pgTable(
	"user_roles",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: integer("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		roleId: uuid("role_id")
			.notNull()
			.references(() => roles.id, { onDelete: "cascade" }),
		scopeType: text("scope_type").notNull(),
		scopeId: text("scope_id"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		uniqueIndex("user_roles_assignment").on(
			table.userId,
			table.roleId,
			table.scopeType,
			table.scopeId,
		),
	],
);
