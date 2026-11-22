import {
	type AnyPgColumn,
	boolean,
	date,
	integer,
	pgTable,
	serial,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
	id: serial("id").primaryKey(),
	email: text("email").notNull().unique(),
	phone: text("phone").unique(),
	passwordHash: text("password_hash"),
	name: text("name"),
	picture: text("picture"),
	dateOfBirth: date("date_of_birth"),
	gender: text("gender"),
	district: text("district"),
	sector: text("sector"),
	village: text("village"),
	economicSector: text("economic_sector"),
	locale: text("locale").notNull().default("rw"),
	photoKey: text("photo_key"),
	guardianContact: text("guardian_contact"),
	createdByUserId: integer("created_by_user_id").references(
		(): AnyPgColumn => users.id,
	),
	mustChangePassword: boolean("must_change_password").notNull().default(false),
	/** Null until the learner confirms with a one-time code. */
	activatedAt: timestamp("activated_at", { withTimezone: true }),
	/** Set while the person has switched the account off. A code can open it again. */
	deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
	deletedAt: timestamp("deleted_at", { withTimezone: true }),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at")
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date()),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export const accounts = pgTable("accounts", {
	id: serial("id").primaryKey(),
	userId: integer("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	provider: text("provider").notNull(),
	providerAccountId: text("provider_account_id").notNull(),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at")
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date()),
});

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;

export const sessions = pgTable("sessions", {
	id: text("id").primaryKey(),
	userId: integer("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	expiresAt: timestamp("expires_at").notNull(),
	createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
