import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../../db";
import {
	badges,
	contentVersions,
	digitalPassports,
	earnedBadges,
	enrollments,
	pointTransactions,
	referrals,
	taskProgress,
	taskTranslations,
	users,
} from "../../db/schema";

export type PassportBadge = {
	id: string;
	titleEn: string;
	titleRw: string;
	skillEn: string;
	skillRw: string;
	level: number;
	awardedAt: string;
};

export type PassportTask = {
	id: string;
	titleEn: string;
	titleRw: string;
	completedAt: string | null;
};

export type PassportReferral = {
	id: string;
	authorName: string;
	note: string;
};

export type LearnerPassport = {
	verifiedMinutes: number;
	hours: number;
	points: number;
	level: number | null;
	badges: PassportBadge[];
	tasks: PassportTask[];
	referrals: PassportReferral[];
};

type PassportDb = Pick<Database, "select">;

function asRecord(value: unknown): Record<string, unknown> | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return null;
	}
	return value as Record<string, unknown>;
}

function textOf(record: Record<string, unknown>, key: string): string {
	const value = record[key];
	return typeof value === "string" ? value : "";
}

function pinnedBadge(
	snapshot: unknown,
	badgeId: string,
): {
	titleEn: string;
	titleRw: string;
	skillEn: string;
	skillRw: string;
	level: number;
} | null {
	const record = asRecord(snapshot);
	const badge = asRecord(record?.badge);
	if (!badge || badge.id !== badgeId) return null;
	const level = badge.level;
	return {
		titleEn: textOf(badge, "titleEn"),
		titleRw: textOf(badge, "titleRw"),
		skillEn: textOf(badge, "skillEn"),
		skillRw: textOf(badge, "skillRw"),
		level:
			typeof level === "number" && Number.isInteger(level) && level > 0
				? level
				: 0,
	};
}

function pinnedTask(
	snapshot: unknown,
	taskId: string,
): { titleEn: string; titleRw: string } | null {
	const record = asRecord(snapshot);
	if (!record || !Array.isArray(record.modules)) return null;
	for (const value of record.modules) {
		const module = asRecord(value);
		if (!module || !Array.isArray(module.tasks)) continue;
		for (const taskValue of module.tasks) {
			const task = asRecord(taskValue);
			if (!task || task.id !== taskId) continue;
			return {
				titleEn: textOf(task, "titleEn"),
				titleRw: textOf(task, "titleRw"),
			};
		}
	}
	return null;
}

function prefer(pinned: string, live: string): string {
	return pinned.trim() ? pinned : live;
}

/** Recommendations the learner has allowed onto the passport. */
export async function shownReferrals(
	database: PassportDb,
	userId: number,
): Promise<PassportReferral[]> {
	const rows = await database
		.select({
			id: referrals.id,
			authorName: users.name,
			note: referrals.note,
		})
		.from(referrals)
		.innerJoin(users, eq(users.id, referrals.authorUserId))
		.where(
			and(
				eq(referrals.learnerUserId, userId),
				sql`${referrals.shownAt} is not null`,
			),
		);
	return rows.map((row) => ({
		id: row.id,
		authorName: row.authorName ?? "",
		note: row.note,
	}));
}

/** The signed-in learner's passport. A revoked badge is left out. */
export async function readPassport(
	database: PassportDb,
	userId: number,
): Promise<LearnerPassport> {
	const [passport] = await database
		.select({ minutes: digitalPassports.verifiedMinutes })
		.from(digitalPassports)
		.where(eq(digitalPassports.userId, userId))
		.limit(1);
	const verifiedMinutes = passport?.minutes ?? 0;
	const [pointsRow] = await database
		.select({
			total: sql<number>`coalesce(sum(${pointTransactions.amount}), 0)::int`,
		})
		.from(pointTransactions)
		.where(eq(pointTransactions.userId, userId));
	const points = Number(pointsRow?.total ?? 0);

	const badgeRows = await database
		.select({
			badgeId: earnedBadges.badgeId,
			entry: earnedBadges.entry,
			awardedAt: earnedBadges.createdAt,
			titleEn: badges.titleEn,
			titleRw: badges.titleRw,
			skillEn: badges.skillEn,
			skillRw: badges.skillRw,
			level: badges.level,
			snapshot: contentVersions.snapshot,
		})
		.from(earnedBadges)
		.innerJoin(badges, eq(badges.id, earnedBadges.badgeId))
		.innerJoin(enrollments, eq(enrollments.id, earnedBadges.enrollmentId))
		.innerJoin(
			contentVersions,
			eq(contentVersions.id, enrollments.contentVersionId),
		)
		.where(eq(earnedBadges.userId, userId))
		.orderBy(desc(earnedBadges.createdAt));
	const revoked = new Set(
		badgeRows
			.filter((row) => row.entry === "revoked")
			.map((row) => row.badgeId),
	);
	const badgesHeld: PassportBadge[] = [];
	for (const row of badgeRows) {
		if (row.entry !== "awarded" || revoked.has(row.badgeId)) continue;
		const pinned = pinnedBadge(row.snapshot, row.badgeId);
		const level = pinned && pinned.level > 0 ? pinned.level : row.level;
		badgesHeld.push({
			id: row.badgeId,
			titleEn: prefer(pinned?.titleEn ?? "", row.titleEn),
			titleRw: prefer(pinned?.titleRw ?? "", row.titleRw ?? ""),
			skillEn: prefer(pinned?.skillEn ?? "", row.skillEn ?? ""),
			skillRw: prefer(pinned?.skillRw ?? "", row.skillRw ?? ""),
			level,
			awardedAt: row.awardedAt.toISOString(),
		});
	}
	const level = badgesHeld.reduce<number | null>(
		(highest, badge) =>
			highest === null || badge.level > highest ? badge.level : highest,
		null,
	);

	const taskRows = await database
		.select({
			taskId: taskProgress.taskId,
			completedAt: taskProgress.completedAt,
			snapshot: contentVersions.snapshot,
		})
		.from(taskProgress)
		.innerJoin(enrollments, eq(enrollments.id, taskProgress.enrollmentId))
		.innerJoin(
			contentVersions,
			eq(contentVersions.id, enrollments.contentVersionId),
		)
		.where(
			and(eq(enrollments.userId, userId), eq(taskProgress.status, "complete")),
		)
		.orderBy(desc(taskProgress.completedAt));
	const missing: string[] = [];
	const tasks: PassportTask[] = taskRows.map((row) => {
		const pinned = pinnedTask(row.snapshot, row.taskId);
		if (!pinned || (!pinned.titleEn && !pinned.titleRw))
			missing.push(row.taskId);
		return {
			id: row.taskId,
			titleEn: pinned?.titleEn ?? "",
			titleRw: pinned?.titleRw ?? "",
			completedAt: row.completedAt ? row.completedAt.toISOString() : null,
		};
	});
	if (missing.length > 0) {
		const translations = await database
			.select({
				taskId: taskTranslations.taskId,
				locale: taskTranslations.locale,
				title: taskTranslations.title,
			})
			.from(taskTranslations)
			.where(inArray(taskTranslations.taskId, missing));
		for (const task of tasks) {
			if (task.titleEn || task.titleRw) continue;
			const english = translations.find(
				(row) => row.taskId === task.id && row.locale === "en",
			);
			const kinyarwanda = translations.find(
				(row) => row.taskId === task.id && row.locale === "rw",
			);
			task.titleEn = english?.title ?? "";
			task.titleRw = kinyarwanda?.title ?? "";
		}
	}

	return {
		verifiedMinutes,
		hours: Math.floor(verifiedMinutes / 60),
		points: Number.isFinite(points) ? points : 0,
		level,
		badges: badgesHeld,
		tasks,
		referrals: await shownReferrals(database, userId),
	};
}
