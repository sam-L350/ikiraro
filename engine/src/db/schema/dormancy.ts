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
import { followUps } from "./follow-ups";
import { districts } from "./geography";
import { hardwareGrants } from "./grants";
import { users } from "./identity";

/** One notice that a recipient stopped answering or stopped practicing. */
export const dormancyAlerts = pgTable(
	"dormancy_alerts",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		followUpId: uuid("follow_up_id")
			.notNull()
			.references(() => followUps.id),
		grantId: uuid("grant_id")
			.notNull()
			.references(() => hardwareGrants.id),
		recipientUserId: integer("recipient_user_id")
			.notNull()
			.references(() => users.id),
		districtId: uuid("district_id")
			.notNull()
			.references(() => districts.id),
		reason: text("reason").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		uniqueIndex("dormancy_alerts_follow_up_reason").on(
			table.followUpId,
			table.reason,
		),
		check(
			"dormancy_alerts_reason",
			sql`${table.reason} in ('unanswered', 'not_practicing')`,
		),
	],
);
