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
import { learningCenters } from "./geography";
import { users } from "./identity";
import { notifications } from "./notifications";

const chargeStatusSql = sql`'accepted', 'delivered', 'failed'`;

/**
 * What a center spent on a text. The phone stays on the user row.
 * A one-time code has no notification, so that link is optional.
 */
export const smsCharges = pgTable(
	"sms_charges",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: integer("user_id").references(() => users.id),
		centerId: uuid("center_id").references(() => learningCenters.id),
		notificationId: uuid("notification_id").references(() => notifications.id),
		provider: text("provider").notNull(),
		providerMessageId: text("provider_message_id").notNull(),
		currency: text("currency").notNull().default("RWF"),
		amount: integer("amount").notNull().default(0),
		status: text("status").notNull().default("accepted"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		deliveredAt: timestamp("delivered_at", { withTimezone: true }),
	},
	(table) => [
		uniqueIndex("sms_charges_provider_message").on(table.providerMessageId),
		check("sms_charges_status", sql`${table.status} in (${chargeStatusSql})`),
		check("sms_charges_amount", sql`${table.amount} >= 0`),
	],
);
