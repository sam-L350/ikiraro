import { and, asc, eq, gte, isNull, sql } from "drizzle-orm";
import type { Database } from "../../db";
import {
	deviceBookings,
	districts,
	domainEvents,
	dormancyAlerts,
	followUps,
	hardwareGrants,
	learningCenters,
	roles,
	sectors,
	sessionAttendance,
	userRoles,
	users,
} from "../../db/schema";
import { writeEvent } from "../audit/write";

type DormancyDb = Database;

export type DormancyReason = "unanswered" | "not_practicing";

export type DormancyRow = {
	id: string;
	recipientName: string;
	reason: DormancyReason;
	day: number;
	districtName: string;
};

function isReason(value: string): value is DormancyReason {
	return value === "unanswered" || value === "not_practicing";
}

async function practicedSince(
	database: DormancyDb,
	userId: number,
	since: Date,
): Promise<boolean> {
	const [attendance] = await database
		.select({ id: sessionAttendance.id })
		.from(sessionAttendance)
		.where(
			and(
				eq(sessionAttendance.learnerUserId, userId),
				gte(sessionAttendance.markedAt, since),
			),
		)
		.limit(1);
	if (attendance) return true;
	const [booking] = await database
		.select({ id: deviceBookings.id })
		.from(deviceBookings)
		.where(
			and(
				eq(deviceBookings.learnerUserId, userId),
				gte(deviceBookings.startsAt, since),
			),
		)
		.limit(1);
	return Boolean(booking);
}

async function coordinators(
	database: DormancyDb,
	districtId: string,
): Promise<number[]> {
	const rows = await database
		.select({ userId: userRoles.userId })
		.from(userRoles)
		.innerJoin(roles, eq(roles.id, userRoles.roleId))
		.where(
			and(
				eq(roles.code, "district_coordinator"),
				eq(userRoles.scopeType, "district"),
				eq(userRoles.scopeId, districtId),
				isNull(userRoles.suspendedAt),
			),
		);
	return rows.map((row) => row.userId);
}

async function notify(
	database: DormancyDb,
	input: { districtId: string; name: string },
): Promise<void> {
	const people = await coordinators(database, input.districtId);
	for (const userId of people) {
		await writeEvent(database, {
			name: "recipient.dormant",
			payload: { userId, name: input.name || "A learner" },
		});
	}
}

/**
 * Tell the district coordinator when a check-in stayed unanswered, or when a
 * newly asked check-in has no practice since the previous one.
 */
export async function raiseDormancy(
	database: DormancyDb,
	sweepStart: Date,
): Promise<number> {
	const silent = await database
		.select({
			followUpId: followUps.id,
			grantId: followUps.grantId,
			userId: hardwareGrants.recipientUserId,
			name: users.name,
			districtId: sectors.districtId,
		})
		.from(followUps)
		.innerJoin(hardwareGrants, eq(hardwareGrants.id, followUps.grantId))
		.innerJoin(users, eq(users.id, hardwareGrants.recipientUserId))
		.innerJoin(learningCenters, eq(learningCenters.id, users.centerId))
		.innerJoin(sectors, eq(sectors.id, learningCenters.sectorId))
		.where(
			and(
				eq(followUps.response, "unresponsive"),
				sql`not exists (
					select 1 from dormancy_alerts
					where dormancy_alerts.follow_up_id = ${followUps.id}
					and dormancy_alerts.reason = 'unanswered'
				)`,
			),
		);
	const asked = await database
		.select({
			followUpId: followUps.id,
			grantId: followUps.grantId,
			day: followUps.day,
			askedAt: followUps.askedAt,
			userId: hardwareGrants.recipientUserId,
			name: users.name,
			districtId: sectors.districtId,
			awardedOn: hardwareGrants.awardedOn,
		})
		.from(followUps)
		.innerJoin(hardwareGrants, eq(hardwareGrants.id, followUps.grantId))
		.innerJoin(users, eq(users.id, hardwareGrants.recipientUserId))
		.innerJoin(learningCenters, eq(learningCenters.id, users.centerId))
		.innerJoin(sectors, eq(sectors.id, learningCenters.sectorId))
		.where(sql`${followUps.askedAt} is not null`)
		.orderBy(asc(followUps.day));
	let raised = 0;
	for (const row of silent) {
		const inserted = await database
			.insert(dormancyAlerts)
			.values({
				followUpId: row.followUpId,
				grantId: row.grantId,
				recipientUserId: row.userId,
				districtId: row.districtId,
				reason: "unanswered",
			})
			.onConflictDoNothing()
			.returning({ id: dormancyAlerts.id });
		if (inserted.length === 0) continue;
		raised += 1;
		await notify(database, {
			districtId: row.districtId,
			name: row.name ?? "",
		});
	}
	for (const row of asked) {
		if (!row.askedAt) continue;
		const earlier = asked.filter(
			(other) =>
				other.grantId === row.grantId && other.day < row.day && other.askedAt,
		);
		const previous = earlier.at(-1);
		if (
			previous?.askedAt &&
			previous.askedAt.getTime() >= sweepStart.getTime()
		) {
			continue;
		}
		const since = previous?.askedAt
			? previous.askedAt
			: new Date(`${row.awardedOn}T00:00:00.000Z`);
		if (await practicedSince(database, row.userId, since)) continue;
		const inserted = await database
			.insert(dormancyAlerts)
			.values({
				followUpId: row.followUpId,
				grantId: row.grantId,
				recipientUserId: row.userId,
				districtId: row.districtId,
				reason: "not_practicing",
			})
			.onConflictDoNothing()
			.returning({ id: dormancyAlerts.id });
		if (inserted.length === 0) continue;
		raised += 1;
		await notify(database, {
			districtId: row.districtId,
			name: row.name ?? "",
		});
	}
	return raised;
}

/** Alerts in the districts this coordinator covers. */
export async function listDormancy(
	database: DormancyDb,
	districtIds: readonly string[] | null,
): Promise<DormancyRow[]> {
	if (districtIds !== null && districtIds.length === 0) return [];
	const rows = await database
		.select({
			id: dormancyAlerts.id,
			recipientName: users.name,
			reason: dormancyAlerts.reason,
			day: followUps.day,
			districtName: districts.name,
			districtId: dormancyAlerts.districtId,
		})
		.from(dormancyAlerts)
		.innerJoin(followUps, eq(followUps.id, dormancyAlerts.followUpId))
		.innerJoin(users, eq(users.id, dormancyAlerts.recipientUserId))
		.innerJoin(districts, eq(districts.id, dormancyAlerts.districtId))
		.orderBy(sql`${dormancyAlerts.createdAt} desc`);
	return rows.flatMap((row) => {
		if (!isReason(row.reason)) return [];
		if (districtIds !== null && !districtIds.includes(row.districtId))
			return [];
		return [
			{
				id: row.id,
				recipientName: row.recipientName ?? "",
				reason: row.reason,
				day: row.day,
				districtName: row.districtName,
			},
		];
	});
}

export async function dormantEventCount(
	database: DormancyDb,
	userId: number,
): Promise<number> {
	const rows = await database
		.select({ id: domainEvents.id })
		.from(domainEvents)
		.where(
			sql`${domainEvents.name} = 'recipient.dormant' and ${domainEvents.payload}->>'userId' = ${String(userId)}`,
		);
	return rows.length;
}
