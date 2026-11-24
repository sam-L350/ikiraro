import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "../../db";
import {
	allocationRounds,
	committeeDecisions,
	districts,
	followUps,
	hardwareGrants,
	hardwareInventory,
	learningCenters,
	outcomeSurveys,
	roles,
	sectors,
	userRoles,
	users,
} from "../../db/schema";
import { writeAudit } from "../audit/write";
import type { Assignment } from "../authz/decide";
import { readableDistricts } from "./equity";

const FLOOR = 10;

type DonorDb = Database;

export type DonorTotals = {
	items: number;
	awarded: number;
	declined: number;
	inUse: number;
	notInUse: number;
	unresponsive: number;
	baselines: number;
	endlines: number;
};

export type DonorDecisionRow = {
	district: string;
	awarded: number;
	declined: number;
};

export type DonorOutcome = {
	paired: number;
	confidence: number;
	tasks: number;
	income: number;
	jobs: number;
};

export type DonorBatchRow = {
	donor: string;
	name: string;
	serial: string;
	center: string;
	district: string;
	status: string;
	outcome: string;
	day30: string;
	day90: string;
	day180: string;
};

export type DonorReport = {
	totals: DonorTotals;
	decisions: DonorDecisionRow[];
	outcome: DonorOutcome | null;
	batches: DonorBatchRow[];
};

type CheckRow = {
	response: string;
	inUse: boolean | null;
};

function inDistrict(districtId: string, districtIds: string[] | null): boolean {
	if (districtIds === null) return true;
	return districtIds.includes(districtId);
}

function deviceOutcome(
	status: string,
	grantStatus: string | null,
	handed: Date | null,
): string {
	if (grantStatus === "recovered") return "recovered";
	if (grantStatus === "transferred") return "transferred";
	if (grantStatus === "active" && handed) return "handed_over";
	if (grantStatus === "active") return "awarded";
	return status;
}

function checkWord(row: CheckRow | undefined): string {
	if (!row) return "";
	switch (row.response) {
		case "waiting":
			return "waiting";
		case "unresponsive":
			return "unresponsive";
		case "answered":
			return row.inUse ? "in_use" : "not_in_use";
		default:
			return "";
	}
}

async function learnerIds(
	database: DonorDb,
	districtIds: string[] | null,
): Promise<number[]> {
	const rows = await database
		.select({ id: users.id, districtId: districts.id })
		.from(users)
		.innerJoin(userRoles, eq(userRoles.userId, users.id))
		.innerJoin(roles, eq(roles.id, userRoles.roleId))
		.leftJoin(learningCenters, eq(learningCenters.id, users.centerId))
		.leftJoin(sectors, eq(sectors.id, learningCenters.sectorId))
		.leftJoin(districts, eq(districts.id, sectors.districtId))
		.where(and(eq(roles.code, "learner"), isNull(users.deletedAt)));
	const ids = new Set<number>();
	for (const row of rows) {
		if (districtIds === null) {
			ids.add(row.id);
			continue;
		}
		if (row.districtId && districtIds.includes(row.districtId)) ids.add(row.id);
	}
	return [...ids];
}

/** Totals, decisions, and outcomes. Names, phones, villages, and images stay out. */
export async function readDonorReport(
	database: DonorDb,
	assignments: readonly Assignment[],
): Promise<DonorReport> {
	const districtIds = await readableDistricts(database, assignments);
	const decisions = await decisionRows(database, districtIds);
	const learners = await learnerIds(database, districtIds);
	const surveys = await surveyTotals(database, learners);
	const batches = await batchRows(database, districtIds);
	let inUse = 0;
	let notInUse = 0;
	let unresponsive = 0;
	for (const row of batches) {
		for (const day of [row.day30, row.day90, row.day180]) {
			if (day === "in_use") inUse += 1;
			if (day === "not_in_use") notInUse += 1;
			if (day === "unresponsive") unresponsive += 1;
		}
	}
	let awarded = 0;
	let declined = 0;
	for (const row of decisions.all) {
		awarded += row.awarded;
		declined += row.declined;
	}
	return {
		totals: {
			items: batches.length,
			awarded,
			declined,
			inUse,
			notInUse,
			unresponsive,
			baselines: surveys.baselines,
			endlines: surveys.endlines,
		},
		decisions: decisions.visible,
		outcome: surveys.outcome,
		batches,
	};
}

async function decisionRows(
	database: DonorDb,
	districtIds: string[] | null,
): Promise<{ all: DonorDecisionRow[]; visible: DonorDecisionRow[] }> {
	const rows = await database
		.select({
			districtId: allocationRounds.districtId,
			district: districts.name,
			decision: committeeDecisions.decision,
		})
		.from(committeeDecisions)
		.innerJoin(
			allocationRounds,
			eq(allocationRounds.id, committeeDecisions.roundId),
		)
		.innerJoin(districts, eq(districts.id, allocationRounds.districtId));
	const counts = new Map<string, DonorDecisionRow>();
	for (const row of rows) {
		if (!inDistrict(row.districtId, districtIds)) continue;
		const current = counts.get(row.district) ?? {
			district: row.district,
			awarded: 0,
			declined: 0,
		};
		if (row.decision === "awarded") current.awarded += 1;
		if (row.decision === "declined") current.declined += 1;
		counts.set(row.district, current);
	}
	const all = [...counts.values()].sort((left, right) =>
		left.district.localeCompare(right.district),
	);
	return {
		all,
		visible: all.filter((row) => row.awarded + row.declined >= FLOOR),
	};
}

async function surveyTotals(
	database: DonorDb,
	learnerIds: number[],
): Promise<{
	baselines: number;
	endlines: number;
	outcome: DonorOutcome | null;
}> {
	if (learnerIds.length === 0) {
		return { baselines: 0, endlines: 0, outcome: null };
	}
	const rows = await database
		.select({
			userId: outcomeSurveys.userId,
			kind: outcomeSurveys.kind,
			confidence: outcomeSurveys.digitalConfidence,
			tasks: outcomeSurveys.tasksDigital,
			income: outcomeSurveys.income,
			jobs: outcomeSurveys.jobsOrCustomers,
		})
		.from(outcomeSurveys)
		.where(inArray(outcomeSurveys.userId, learnerIds));
	let baselines = 0;
	let endlines = 0;
	const byUser = new Map<
		number,
		{ baseline?: (typeof rows)[number]; endline?: (typeof rows)[number] }
	>();
	for (const row of rows) {
		if (row.kind === "baseline") baselines += 1;
		if (row.kind === "endline") endlines += 1;
		const pair = byUser.get(row.userId) ?? {};
		if (row.kind === "baseline") pair.baseline = row;
		if (row.kind === "endline") pair.endline = row;
		byUser.set(row.userId, pair);
	}
	const outcome: DonorOutcome = {
		paired: 0,
		confidence: 0,
		tasks: 0,
		income: 0,
		jobs: 0,
	};
	for (const pair of byUser.values()) {
		if (!pair.baseline || !pair.endline) continue;
		outcome.paired += 1;
		outcome.confidence += pair.endline.confidence - pair.baseline.confidence;
		outcome.tasks += pair.endline.tasks - pair.baseline.tasks;
		outcome.income += pair.endline.income - pair.baseline.income;
		outcome.jobs += pair.endline.jobs - pair.baseline.jobs;
	}
	return {
		baselines,
		endlines,
		outcome: outcome.paired >= FLOOR ? outcome : null,
	};
}

async function batchRows(
	database: DonorDb,
	districtIds: string[] | null,
): Promise<DonorBatchRow[]> {
	const items = await database
		.select({
			id: hardwareInventory.id,
			donor: hardwareInventory.donor,
			name: hardwareInventory.name,
			serial: hardwareInventory.serial,
			status: hardwareInventory.status,
			center: learningCenters.name,
			districtId: districts.id,
			district: districts.name,
		})
		.from(hardwareInventory)
		.innerJoin(
			learningCenters,
			eq(learningCenters.id, hardwareInventory.centerId),
		)
		.innerJoin(sectors, eq(sectors.id, learningCenters.sectorId))
		.innerJoin(districts, eq(districts.id, sectors.districtId))
		.where(sql`${hardwareInventory.donor} is not null`);
	const visible = items.filter(
		(row) => row.donor && inDistrict(row.districtId, districtIds),
	);
	const inventoryIds = visible.map((row) => row.id);
	const grants =
		inventoryIds.length === 0
			? []
			: await database
					.select({
						id: hardwareGrants.id,
						inventoryId: hardwareGrants.inventoryId,
						status: hardwareGrants.status,
						handed: hardwareGrants.handoverConfirmedAt,
						createdAt: hardwareGrants.createdAt,
					})
					.from(hardwareGrants)
					.where(
						and(
							inArray(hardwareGrants.inventoryId, inventoryIds),
							sql`${hardwareGrants.status} in ('active', 'recovered', 'transferred')`,
						),
					);
	const grantByItem = new Map<string, (typeof grants)[number]>();
	for (const grant of grants) {
		const current = grantByItem.get(grant.inventoryId);
		if (
			!current ||
			(grant.status === "active" && current.status !== "active")
		) {
			grantByItem.set(grant.inventoryId, grant);
			continue;
		}
		if (current.status !== "active" && grant.createdAt > current.createdAt) {
			grantByItem.set(grant.inventoryId, grant);
		}
	}
	const grantIds = [...grantByItem.values()].map((grant) => grant.id);
	const checks =
		grantIds.length === 0
			? []
			: await database
					.select({
						grantId: followUps.grantId,
						day: followUps.day,
						response: followUps.response,
						inUse: followUps.inUse,
					})
					.from(followUps)
					.where(inArray(followUps.grantId, grantIds));
	const byGrant = new Map<string, Map<string, CheckRow>>();
	for (const check of checks) {
		const days = byGrant.get(check.grantId) ?? new Map<string, CheckRow>();
		days.set(String(check.day), {
			response: check.response,
			inUse: check.inUse,
		});
		byGrant.set(check.grantId, days);
	}
	return visible
		.map((row) => {
			const grant = grantByItem.get(row.id);
			const days = grant ? byGrant.get(grant.id) : undefined;
			return {
				donor: row.donor ?? "",
				name: row.name,
				serial: row.serial,
				center: row.center,
				district: row.district,
				status: row.status,
				outcome: deviceOutcome(
					row.status,
					grant?.status ?? null,
					grant?.handed ?? null,
				),
				day30: checkWord(days?.get("30")),
				day90: checkWord(days?.get("90")),
				day180: checkWord(days?.get("180")),
			};
		})
		.sort((left, right) => {
			const donor = left.donor.localeCompare(right.donor);
			if (donor !== 0) return donor;
			return left.serial.localeCompare(right.serial);
		});
}

function cell(value: string | number): string {
	const text = String(value);
	if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
	return text;
}

/** One file: totals, decisions, outcomes, and where each donated item went. */
export async function exportDonorReport(
	database: DonorDb,
	input: { actorId: number; assignments: readonly Assignment[]; ip: string },
): Promise<{ csv: string }> {
	const report = await readDonorReport(database, input.assignments);
	const totals = report.totals;
	const lines = [
		"totals,count",
		`items,${totals.items}`,
		`awarded,${totals.awarded}`,
		`declined,${totals.declined}`,
		`in_use,${totals.inUse}`,
		`not_in_use,${totals.notInUse}`,
		`unresponsive,${totals.unresponsive}`,
		`baselines,${totals.baselines}`,
		`endlines,${totals.endlines}`,
		"",
		"district,awarded,declined",
	];
	for (const row of report.decisions) {
		lines.push([row.district, row.awarded, row.declined].map(cell).join(","));
	}
	lines.push(
		"",
		"paired,confidence_change,tasks_change,income_change,jobs_change",
	);
	if (report.outcome) {
		lines.push(
			[
				report.outcome.paired,
				report.outcome.confidence,
				report.outcome.tasks,
				report.outcome.income,
				report.outcome.jobs,
			]
				.map(cell)
				.join(","),
		);
	}
	lines.push(
		"",
		"donor,item,serial,center,district,status,outcome,day_30,day_90,day_180",
	);
	for (const row of report.batches) {
		lines.push(
			[
				row.donor,
				row.name,
				row.serial,
				row.center,
				row.district,
				row.status,
				row.outcome,
				row.day30,
				row.day90,
				row.day180,
			]
				.map(cell)
				.join(","),
		);
	}
	await writeAudit(database, {
		actorId: input.actorId,
		action: "donor.exported",
		targetType: "donor_report",
		targetId: String(input.actorId),
		ipAddress: input.ip,
		metadata: { batches: report.batches.length },
	});
	return { csv: lines.join("\n") };
}
