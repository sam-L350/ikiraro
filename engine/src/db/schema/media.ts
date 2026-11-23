import { sql } from "drizzle-orm";
import {
	check,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { users } from "./identity";

const mediaStatusSql = sql`'pending', 'ready'`;

/** A private object. The hash is written only when the upload is finalized. */
export const mediaObjects = pgTable(
	"media_objects",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		ownerUserId: integer("owner_user_id")
			.notNull()
			.references(() => users.id),
		objectKey: text("object_key").notNull(),
		contentType: text("content_type").notNull(),
		declaredBytes: integer("declared_bytes").notNull(),
		sizeBytes: integer("size_bytes"),
		sha256: text("sha256"),
		status: text("status").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		finalizedAt: timestamp("finalized_at", { withTimezone: true }),
	},
	(table) => [
		uniqueIndex("media_objects_key").on(table.objectKey),
		check("media_objects_status", sql`${table.status} in (${mediaStatusSql})`),
	],
);
