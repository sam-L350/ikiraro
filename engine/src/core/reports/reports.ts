import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Database } from "../../db";
import {
	backlogCounts,
	contentVersions,
	districts,
	enrollments,
	learningCenters,
	mentors,
	notifications,
	reportSchedules,
	reportSends,
	roles,
	sectors,
	taskProgress,
	taskSubmissions,
	userRoles,
	users,
	warningRules,
} from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit } from "../audit/write";
import type { Assignment } from "../authz/decide";
import { readDonorReport } from "../hardware/donor";
import { readableDistricts } from "../hardware/equity";

const DAY_MS = 24 * 60 * 60 * 1000;
const QUIET_LIMIT = 3650;
const INTERVAL_LIMIT = 366;

type ReportDb = Database;

export type WarningRuleView = {
	districtId: string;
	districtName: string;
	quietDays: number;
};

export type WarningRow = {
	who: string;
	kind: "dropout" | "backlog";
	ageDays: number;
};

export type WarningList = {
	districts: DistrictChoice[];
	rules: WarningRuleView[];
	rows: WarningRow[];
};

export type DistrictChoice = {
	id: string;
	name: string;
};

export type ReportScheduleView = {
	districtId: string;
	districtName: string;
	intervalDays: number;
};

export type ScheduledReportMeta = {
	districts: DistrictChoice[];
	schedules: ReportScheduleView[];
};

type ScopeDistrict = DistrictChoice;

function wholeDays(value: number, limit: number): number {
	if (!Number.isInteger(value) || value < 1 || value > limit) {
		throw errors.badRequest("Write a whole number of days.", {
			reason: "days",
		});
	}
	return value;
}

function ageDays(from: Date, now: Date): number {
	const days = Math.floor((now.getTime() - from.getTime()) / DAY_MS);
	return days > 0 ? days : 0;
}

function requiredTaskIds(snapshot: unknown): string[] {
	if (!snapshot || typeof snapshot !== "object") return [];
	const modules = (snapshot as { modules?: unknown }).modules;
	if (!Array.isArray(modules)) return [];
	const ids: string[] = [];
	for (const module of modules) {
		if (!module || typeof module !== "object") continue;
		const tasks = (module as { tasks?: unknown }).tasks;
		if (!Array.isArray(tasks)) continue;
		for (const task of tasks) {
			if (!task || typeof task !== "object") continue;
			const row = task as { id?: unknown; required?: unknown };
			if (row.required === false) continue;
			if (typeof row.id === "string" && row.id.length > 0) ids.push(row.id);
		}
	}
	return ids;
}

async function districtsInScope(
	database: ReportDb,
	assignments: readonly Assignment[],
): Promise<ScopeDistrict[]> {
	const allowed = await readableDistricts(database, assignments);
	if (allowed !== null && allowed.length === 0) return [];
	const rows = await database
		.select({ id: districts.id, name: districts.name })
		.from(districts)
		.where(allowed === null ? undefined : inArray(districts.id, allowed));
	return rows.sort((left, right) => left.name.localeCompare(right.name));
}

async function requireDistrict(
	database: ReportDb,
	assignments: readonly Assignment[],
	districtId: string,
): Promise<ScopeDistrict> {
	const trimmed = districtId.trim();
	if (!trimmed) {
		throw errors.badRequest("Choose the district.", { reason: "district" });
	}
	if (
		!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
			trimmed,
		)
	) {
		throw errors.notFound("This district was not found.");
	}
	const scope = await districtsInScope(database, assignments);
	const chosen = scope.find((row) => row.id === trimmed);
	if (!chosen) {
		const [stored] = await database
			.select({ id: districts.id })
			.from(districts)
			.where(eq(districts.id, trimmed))
			.limit(1);
		if (!stored) {
			throw errors.notFound("This district was not found.");
		}
		throw errors.forbidden("This district is outside your scope.", {
			reason: "district",
		});
	}
	return chosen;
}

async function centersIn(
	database: ReportDb,
	districtId: string,
): Promise<{ id: string; name: string }[]> {
	return database
		.select({ id: learningCenters.id, name: learningCenters.name })
		.from(learningCenters)
		.innerJoin(sectors, eq(sectors.id, learningCenters.sectorId))
		.where(eq(sectors.districtId, districtId));
}

async function waitingByCenter(
	database: ReportDb,
	centerIds: readonly string[],
): Promise<Map<string, { count: number; oldest: Date | null }>> {
	const counts = new Map<string, { count: number; oldest: Date | null }>();
	if (centerIds.length === 0) return counts;
	const rows = await database
		.select({
			centerId: enrollments.centerId,
			submittedAt: taskSubmissions.submittedAt,
			createdAt: taskSubmissions.createdAt,
		})
		.from(taskSubmissions)
		.innerJoin(enrollments, eq(enrollments.id, taskSubmissions.enrollmentId))
		.where(
			and(
				inArray(enrollments.centerId, [...centerIds]),
				inArray(taskSubmissions.status, ["pending", "in_review"]),
			),
		);
	for (const row of rows) {
		const current = counts.get(row.centerId) ?? { count: 0, oldest: null };
		current.count += 1;
		const at = row.submittedAt ?? row.createdAt;
		if (!current.oldest || at < current.oldest) current.oldest = at;
		counts.set(row.centerId, current);
	}
	return counts;
}

/** Store the waiting count when it differs from the last count for that center. */
async function recordBacklog(
	database: ReportDb,
	districtId: string,
): Promise<void> {
	const centers = await centersIn(database, districtId);
	if (centers.length === 0) return;
	const ids = centers.map((center) => center.id);
	const waiting = await waitingByCenter(database, ids);
	const stored = await database
		.select({
			centerId: backlogCounts.centerId,
			waitingCount: backlogCounts.waitingCount,
			recordedAt: backlogCounts.recordedAt,
		})
		.from(backlogCounts)
		.where(inArray(backlogCounts.centerId, ids))
		.orderBy(desc(backlogCounts.recordedAt));
	const latest = new Map<string, number>();
	for (const row of stored) {
		if (!latest.has(row.centerId)) latest.set(row.centerId, row.waitingCount);
	}
	for (const center of centers) {
		const count = waiting.get(center.id)?.count ?? 0;
		if (latest.get(center.id) === count) continue;
		await database.insert(backlogCounts).values({
			centerId: center.id,
			waitingCount: count,
		});
	}
}

/** Quiet learners and centers whose waiting evidence has grown. */
export async function readWarnings(
	database: ReportDb,
	assignments: readonly Assignment[],
	now = new Date(),
): Promise<WarningList> {
	const scope = await districtsInScope(database, assignments);
	if (scope.length === 0) return { districts: [], rules: [], rows: [] };
	const districtIds = scope.map((row) => row.id);
	const names = new Map(scope.map((row) => [row.id, row.name]));
	const ruleRows = await database
		.select({
			districtId: warningRules.districtId,
			quietDays: warningRules.quietDays,
			createdAt: warningRules.createdAt,
		})
		.from(warningRules)
		.where(inArray(warningRules.districtId, districtIds))
		.orderBy(desc(warningRules.createdAt));
	const quietFor = new Map<string, number>();
	const rules: WarningRuleView[] = [];
	for (const row of ruleRows) {
		if (quietFor.has(row.districtId)) continue;
		quietFor.set(row.districtId, row.quietDays);
		rules.push({
			districtId: row.districtId,
			districtName: names.get(row.districtId) ?? "",
			quietDays: row.quietDays,
		});
	}
	const rows: WarningRow[] = [];
	rows.push(...(await dropoutRows(database, districtIds, quietFor, now)));
	rows.push(...(await backlogRows(database, districtIds, now)));
	rows.sort((left, right) => {
		if (right.ageDays !== left.ageDays) return right.ageDays - left.ageDays;
		return left.who.localeCompare(right.who);
	});
	return { districts: scope, rules, rows };
}

async function dropoutRows(
	database: ReportDb,
	districtIds: readonly string[],
	quietFor: ReadonlyMap<string, number>,
	now: Date,
): Promise<WarningRow[]> {
	if (quietFor.size === 0) return [];
	const enrolled = await database
		.select({
			enrollmentId: enrollments.id,
			name: users.name,
			startedAt: enrollments.startedAt,
			districtId: sectors.districtId,
			snapshot: contentVersions.snapshot,
		})
		.from(enrollments)
		.innerJoin(users, eq(users.id, enrollments.userId))
		.innerJoin(learningCenters, eq(learningCenters.id, enrollments.centerId))
		.innerJoin(sectors, eq(sectors.id, learningCenters.sectorId))
		.innerJoin(
			contentVersions,
			eq(contentVersions.id, enrollments.contentVersionId),
		)
		.where(
			and(
				isNull(users.deletedAt),
				inArray(sectors.districtId, [...districtIds]),
			),
		);
	const watched = enrolled.filter((row) => quietFor.has(row.districtId));
	if (watched.length === 0) return [];
	const progress = await database
		.select({
			enrollmentId: taskProgress.enrollmentId,
			taskId: taskProgress.taskId,
			status: taskProgress.status,
			startedAt: taskProgress.startedAt,
			completedAt: taskProgress.completedAt,
		})
		.from(taskProgress)
		.where(
			inArray(
				taskProgress.enrollmentId,
				watched.map((row) => row.enrollmentId),
			),
		);
	const byEnrollment = new Map<string, { complete: Set<string>; last: Date }>();
	for (const row of watched) {
		byEnrollment.set(row.enrollmentId, {
			complete: new Set(),
			last: row.startedAt,
		});
	}
	for (const row of progress) {
		const current = byEnrollment.get(row.enrollmentId);
		if (!current) continue;
		if (row.status === "complete") current.complete.add(row.taskId);
		if (row.startedAt > current.last) current.last = row.startedAt;
		if (row.completedAt && row.completedAt > current.last) {
			current.last = row.completedAt;
		}
	}
	const oldest = new Map<string, number>();
	for (const row of watched) {
		const required = requiredTaskIds(row.snapshot);
		if (required.length === 0) continue;
		const current = byEnrollment.get(row.enrollmentId);
		if (!current) continue;
		const finished = required.every((taskId) => current.complete.has(taskId));
		if (finished) continue;
		const quietDays = quietFor.get(row.districtId);
		if (quietDays === undefined) continue;
		const days = ageDays(current.last, now);
		if (days < quietDays) continue;
		const who = row.name?.trim() ?? "";
		if (!who) continue;
		const previous = oldest.get(who);
		if (previous === undefined || days > previous) oldest.set(who, days);
	}
	return [...oldest.entries()].map(([who, days]) => ({
		who,
		kind: "dropout",
		ageDays: days,
	}));
}

async function backlogRows(
	database: ReportDb,
	districtIds: readonly string[],
	now: Date,
): Promise<WarningRow[]> {
	const centers = await database
		.select({
			id: learningCenters.id,
			name: learningCenters.name,
			districtId: sectors.districtId,
		})
		.from(learningCenters)
		.innerJoin(sectors, eq(sectors.id, learningCenters.sectorId))
		.where(inArray(sectors.districtId, [...districtIds]));
	if (centers.length === 0) return [];
	const ids = centers.map((center) => center.id);
	const stored = await database
		.select({
			centerId: backlogCounts.centerId,
			waitingCount: backlogCounts.waitingCount,
		})
		.from(backlogCounts)
		.where(inArray(backlogCounts.centerId, ids))
		.orderBy(desc(backlogCounts.recordedAt));
	const history = new Map<string, number[]>();
	for (const row of stored) {
		const list = history.get(row.centerId) ?? [];
		if (list.length < 2) list.push(row.waitingCount);
		history.set(row.centerId, list);
	}
	const waiting = await waitingByCenter(database, ids);
	const rows: WarningRow[] = [];
	for (const center of centers) {
		const counts = history.get(center.id) ?? [];
		const latest = counts[0];
		const previous = counts[1];
		if (latest === undefined || previous === undefined) continue;
		if (latest <= previous) continue;
		const current = waiting.get(center.id);
		if (!current || current.count === 0 || !current.oldest) continue;
		rows.push({
			who: center.name,
			kind: "backlog",
			ageDays: ageDays(current.oldest, now),
		});
	}
	return rows;
}

/** The newest quiet-day rule for this district. Also records the waiting count. */
export async function createWarningRule(
	database: ReportDb,
	input: {
		actorId: number;
		assignments: readonly Assignment[];
		districtId: string;
		quietDays: number;
		ip?: string;
	},
): Promise<WarningRuleView> {
	const quietDays = wholeDays(input.quietDays, QUIET_LIMIT);
	const district = await requireDistrict(
		database,
		input.assignments,
		input.districtId,
	);
	await database.insert(warningRules).values({
		districtId: district.id,
		quietDays,
		createdByUserId: input.actorId,
	});
	await recordBacklog(database, district.id);
	await writeAudit(database, {
		actorId: input.actorId,
		action: "warning.rule",
		targetType: "district",
		targetId: district.id,
		ipAddress: input.ip,
		metadata: { quietDays },
	});
	return {
		districtId: district.id,
		districtName: district.name,
		quietDays,
	};
}

/** Districts this person can schedule, and the newest interval for each. */
export async function readReportSchedules(
	database: ReportDb,
	assignments: readonly Assignment[],
): Promise<ScheduledReportMeta> {
	const scope = await districtsInScope(database, assignments);
	if (scope.length === 0) return { districts: [], schedules: [] };
	const stored = await database
		.select({
			districtId: reportSchedules.districtId,
			intervalDays: reportSchedules.intervalDays,
			createdAt: reportSchedules.createdAt,
		})
		.from(reportSchedules)
		.where(
			inArray(
				reportSchedules.districtId,
				scope.map((row) => row.id),
			),
		)
		.orderBy(desc(reportSchedules.createdAt));
	const names = new Map(scope.map((row) => [row.id, row.name]));
	const seen = new Set<string>();
	const schedules: ReportScheduleView[] = [];
	for (const row of stored) {
		if (seen.has(row.districtId)) continue;
		seen.add(row.districtId);
		schedules.push({
			districtId: row.districtId,
			districtName: names.get(row.districtId) ?? "",
			intervalDays: row.intervalDays,
		});
	}
	return { districts: scope, schedules };
}

/** Store how many days pass before this district's report is emailed again. */
export async function createReportSchedule(
	database: ReportDb,
	input: {
		actorId: number;
		assignments: readonly Assignment[];
		districtId: string;
		intervalDays: number;
		ip?: string;
	},
): Promise<ReportScheduleView> {
	const intervalDays = wholeDays(input.intervalDays, INTERVAL_LIMIT);
	const district = await requireDistrict(
		database,
		input.assignments,
		input.districtId,
	);
	await database.insert(reportSchedules).values({
		districtId: district.id,
		intervalDays,
		createdByUserId: input.actorId,
	});
	await writeAudit(database, {
		actorId: input.actorId,
		action: "report.scheduled",
		targetType: "district",
		targetId: district.id,
		ipAddress: input.ip,
		metadata: { intervalDays },
	});
	return {
		districtId: district.id,
		districtName: district.name,
		intervalDays,
	};
}

function reportBody(
	districtName: string,
	totals: {
		items: number;
		awarded: number;
		declined: number;
		inUse: number;
		notInUse: number;
		unresponsive: number;
		baselines: number;
		endlines: number;
	},
): string {
	return [
		districtName,
		`Items ${totals.items}.`,
		`Awarded ${totals.awarded}.`,
		`Declined ${totals.declined}.`,
		`In use ${totals.inUse}.`,
		`Not in use ${totals.notInUse}.`,
		`Unresponsive ${totals.unresponsive}.`,
		`Baselines ${totals.baselines}.`,
		`Endlines ${totals.endlines}.`,
	].join(" ");
}

async function recipients(
	database: ReportDb,
	districtId: string,
): Promise<number[]> {
	const coordinators = await database
		.select({ userId: users.id, email: users.email })
		.from(userRoles)
		.innerJoin(roles, eq(roles.id, userRoles.roleId))
		.innerJoin(users, eq(users.id, userRoles.userId))
		.where(
			and(
				eq(roles.code, "district_coordinator"),
				eq(userRoles.scopeType, "district"),
				eq(userRoles.scopeId, districtId),
				isNull(userRoles.suspendedAt),
				isNull(users.deletedAt),
			),
		);
	const partners = await database
		.select({ userId: users.id, email: users.email })
		.from(mentors)
		.innerJoin(users, eq(users.id, mentors.userId))
		.where(
			and(
				eq(mentors.kind, "partner"),
				eq(mentors.status, "approved"),
				isNull(users.deletedAt),
			),
		);
	const ids = new Set<number>();
	for (const person of [...coordinators, ...partners]) {
		if (!person.email.trim()) continue;
		ids.add(person.userId);
	}
	return [...ids];
}

/**
 * Email the donor totals when a district's interval has passed.
 * The first email waits the full interval. Names stay out of the message.
 */
export async function sendDueReports(
	database: ReportDb,
	now = new Date(),
): Promise<number> {
	const schedules = await database
		.select({
			districtId: reportSchedules.districtId,
			intervalDays: reportSchedules.intervalDays,
			createdAt: reportSchedules.createdAt,
		})
		.from(reportSchedules)
		.orderBy(desc(reportSchedules.createdAt));
	const latest = new Map<string, { intervalDays: number; createdAt: Date }>();
	for (const row of schedules) {
		if (!latest.has(row.districtId)) {
			latest.set(row.districtId, {
				intervalDays: row.intervalDays,
				createdAt: row.createdAt,
			});
		}
	}
	const sends = await database
		.select({
			districtId: reportSends.districtId,
			sentAt: reportSends.sentAt,
		})
		.from(reportSends)
		.orderBy(desc(reportSends.sentAt));
	const lastSent = new Map<string, Date>();
	for (const row of sends) {
		if (!lastSent.has(row.districtId)) lastSent.set(row.districtId, row.sentAt);
	}
	let sent = 0;
	for (const [districtId, schedule] of latest) {
		const interval = schedule.intervalDays * DAY_MS;
		const openedAt = schedule.createdAt.getTime() + interval;
		if (now.getTime() < openedAt) continue;
		const previous = lastSent.get(districtId);
		if (previous && now.getTime() < previous.getTime() + interval) continue;
		const [district] = await database
			.select({ name: districts.name })
			.from(districts)
			.where(eq(districts.id, districtId))
			.limit(1);
		if (!district) continue;
		const report = await readDonorReport(database, [
			{
				role: "district_coordinator",
				scopeType: "district",
				scopeId: districtId,
			},
		]);
		const people = await recipients(database, districtId);
		const body = reportBody(district.name, report.totals);
		for (const userId of people) {
			await database.insert(notifications).values({
				userId,
				eventName: "report.scheduled",
				channel: "email",
				title: "Scheduled report",
				body,
				status: "queued",
			});
		}
		await database.insert(reportSends).values({
			districtId,
			sentAt: now,
			recipientCount: people.length,
		});
		await recordBacklog(database, districtId);
		sent += 1;
	}
	return sent;
}
