import { asc, eq, inArray, max } from "drizzle-orm";
import type { Database } from "../../db";
import {
	badges,
	courses,
	courseTranslations,
	modulePrerequisites,
	modules,
	moduleTranslations,
	rubricCriteria,
	tasks,
	taskTranslations,
} from "../../db/schema";
import type { BadgeRule, ContentStatus } from "../../db/schema/content";
import { errors } from "../api/error";
import { writeAudit, writeEvent } from "../audit/write";
import {
	readBadgeRule,
	requireBadgeRule,
	requireLevel,
	requireValidDays,
} from "./badge";
import { storeMediaKey, storeOutboundUrl } from "./media";
import { requirePassThreshold } from "./rubric";

type AuthorDb = Pick<Database, "insert" | "select" | "transaction" | "update">;

type ModuleWriteDb = AuthorDb & Pick<Database, "delete">;

export const EVIDENCE_TYPES = ["photo", "file", "note", "voice"] as const;

export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export type CourseSummary = {
	id: string;
	status: ContentStatus;
	title: string;
	missingKinyarwanda: boolean;
};

export type CriterionView = {
	id: string;
	position: number;
	weight: number;
	passThreshold: number;
	promptEn: string;
	promptRw: string;
	missingKinyarwanda: boolean;
};

export type TaskView = {
	id: string;
	position: number;
	status: ContentStatus;
	evidenceType: string | null;
	passThreshold: number;
	required: boolean;
	imageKey: string;
	audioKey: string;
	jobAidKey: string;
	outboundUrl: string;
	titleEn: string;
	titleRw: string;
	instructionsEn: string;
	instructionsRw: string;
	missingKinyarwanda: boolean;
	criteria: CriterionView[];
};

export type BadgeView = {
	id: string;
	titleEn: string;
	titleRw: string;
	skillEn: string;
	skillRw: string;
	level: number;
	validDays: number | null;
	missingKinyarwanda: boolean;
	requiresInPerson: boolean;
	rule: BadgeRule;
};

export type ModuleView = {
	id: string;
	position: number;
	status: ContentStatus;
	titleEn: string;
	titleRw: string;
	summaryEn: string;
	summaryRw: string;
	missingKinyarwanda: boolean;
	requires: string[];
	tasks: TaskView[];
};

export type CourseView = {
	id: string;
	status: ContentStatus;
	titleEn: string;
	titleRw: string;
	summaryEn: string;
	summaryRw: string;
	category: string;
	economicSector: string;
	level: number;
	missingKinyarwanda: boolean;
	reviewNote: string;
	approved: boolean;
	badge: BadgeView | null;
	modules: ModuleView[];
};

type CourseText = {
	titleEn: string;
	titleRw?: string;
	summaryEn?: string;
	summaryRw?: string;
};

type CourseCatalog = {
	category?: string;
	economicSector?: string;
	level?: number;
};

function clean(value: string | undefined): string {
	return (value ?? "").trim();
}

const SKILL_LIMIT = 280;

function cleanSkill(value: string | undefined): string | null {
	const trimmed = clean(value);
	if (!trimmed) return null;
	if (trimmed.length > SKILL_LIMIT) {
		throw errors.badRequest("That skill line is too long.", {
			reason: "skill",
		});
	}
	return trimmed;
}

function isContentStatus(value: string): value is ContentStatus {
	switch (value) {
		case "draft":
		case "in_review":
		case "published":
		case "retired":
			return true;
		default:
			return false;
	}
}

export function isEvidenceType(value: string): value is EvidenceType {
	switch (value) {
		case "photo":
		case "file":
		case "note":
		case "voice":
			return true;
		default:
			return false;
	}
}

function gap(english: string, kinyarwanda: string): boolean {
	return english.length > 0 && kinyarwanda.length === 0;
}

function requireEnglishTitle(title: string): string {
	if (!title) {
		throw errors.badRequest("Enter an English title.", {
			reason: "title_required",
		});
	}
	return title;
}

async function requireCourse(
	database: AuthorDb,
	courseId: string,
): Promise<{ id: string; status: ContentStatus }> {
	const [row] = await database
		.select({ id: courses.id, status: courses.status })
		.from(courses)
		.where(eq(courses.id, courseId))
		.limit(1);
	if (!row || !isContentStatus(row.status)) {
		throw errors.notFound("That course was not found.");
	}
	return { id: row.id, status: row.status };
}

async function requireDraft(
	database: AuthorDb,
	courseId: string,
): Promise<void> {
	const course = await requireCourse(database, courseId);
	if (course.status !== "draft") {
		throw errors.conflict("This course is not a draft.", {
			reason: "not_draft",
		});
	}
}

async function courseIdForModule(
	database: AuthorDb,
	moduleId: string,
): Promise<string> {
	const [row] = await database
		.select({ courseId: modules.courseId })
		.from(modules)
		.where(eq(modules.id, moduleId))
		.limit(1);
	if (!row) throw errors.notFound("That module was not found.");
	return row.courseId;
}

async function courseIdForTask(
	database: AuthorDb,
	taskId: string,
): Promise<string> {
	const [row] = await database
		.select({ courseId: modules.courseId })
		.from(tasks)
		.innerJoin(modules, eq(modules.id, tasks.moduleId))
		.where(eq(tasks.id, taskId))
		.limit(1);
	if (!row) throw errors.notFound("That task was not found.");
	return row.courseId;
}

async function courseIdForCriterion(
	database: AuthorDb,
	criterionId: string,
): Promise<string> {
	const [row] = await database
		.select({ courseId: modules.courseId })
		.from(rubricCriteria)
		.innerJoin(tasks, eq(tasks.id, rubricCriteria.taskId))
		.innerJoin(modules, eq(modules.id, tasks.moduleId))
		.where(eq(rubricCriteria.id, criterionId))
		.limit(1);
	if (!row) throw errors.notFound("That criterion was not found.");
	return row.courseId;
}

async function nextPosition(
	database: AuthorDb,
	kind: "module" | "task" | "criterion",
	parentId: string,
): Promise<number> {
	switch (kind) {
		case "module": {
			const [row] = await database
				.select({ position: max(modules.position) })
				.from(modules)
				.where(eq(modules.courseId, parentId));
			return (row?.position ?? -1) + 1;
		}
		case "task": {
			const [row] = await database
				.select({ position: max(tasks.position) })
				.from(tasks)
				.where(eq(tasks.moduleId, parentId));
			return (row?.position ?? -1) + 1;
		}
		case "criterion": {
			const [row] = await database
				.select({ position: max(rubricCriteria.position) })
				.from(rubricCriteria)
				.where(eq(rubricCriteria.taskId, parentId));
			return (row?.position ?? -1) + 1;
		}
		default: {
			const unreachable: never = kind;
			return unreachable;
		}
	}
}

export async function readCourse(
	database: AuthorDb,
	courseId: string,
): Promise<CourseView> {
	await requireCourse(database, courseId);
	const courseRows = await database
		.select({
			locale: courseTranslations.locale,
			title: courseTranslations.title,
			summary: courseTranslations.summary,
			status: courses.status,
			reviewNote: courses.reviewNote,
			reviewedByUserId: courses.reviewedByUserId,
			category: courses.category,
			economicSector: courses.economicSector,
			level: courses.level,
		})
		.from(courses)
		.leftJoin(courseTranslations, eq(courseTranslations.courseId, courses.id))
		.where(eq(courses.id, courseId));
	const status = courseRows[0]?.status;
	if (!status || !isContentStatus(status)) {
		throw errors.notFound("That course was not found.");
	}
	const courseText = textPair(
		courseRows.flatMap((row) =>
			row.locale
				? [{ locale: row.locale, title: row.title, extra: row.summary }]
				: [],
		),
	);

	const moduleRows = await database
		.select({
			id: modules.id,
			position: modules.position,
			status: modules.status,
			locale: moduleTranslations.locale,
			title: moduleTranslations.title,
			summary: moduleTranslations.summary,
		})
		.from(modules)
		.leftJoin(moduleTranslations, eq(moduleTranslations.moduleId, modules.id))
		.where(eq(modules.courseId, courseId))
		.orderBy(asc(modules.position));

	const moduleIds = [...new Set(moduleRows.map((row) => row.id))];
	const prerequisiteRows =
		moduleIds.length === 0
			? []
			: await database
					.select({
						moduleId: modulePrerequisites.moduleId,
						requiredModuleId: modulePrerequisites.requiredModuleId,
					})
					.from(modulePrerequisites)
					.where(inArray(modulePrerequisites.moduleId, moduleIds));
	const taskRows =
		moduleIds.length === 0
			? []
			: await database
					.select({
						id: tasks.id,
						moduleId: tasks.moduleId,
						position: tasks.position,
						status: tasks.status,
						evidenceType: tasks.evidenceType,
						passThreshold: tasks.passThreshold,
						required: tasks.required,
						imageKey: tasks.imageKey,
						audioKey: tasks.audioKey,
						jobAidKey: tasks.jobAidKey,
						outboundUrl: tasks.outboundUrl,
						locale: taskTranslations.locale,
						title: taskTranslations.title,
						instructions: taskTranslations.instructions,
					})
					.from(tasks)
					.leftJoin(taskTranslations, eq(taskTranslations.taskId, tasks.id))
					.where(inArray(tasks.moduleId, moduleIds))
					.orderBy(asc(tasks.position));
	const taskIds = [...new Set(taskRows.map((row) => row.id))];
	const criterionRows =
		taskIds.length === 0
			? []
			: await database
					.select()
					.from(rubricCriteria)
					.where(inArray(rubricCriteria.taskId, taskIds))
					.orderBy(asc(rubricCriteria.position));

	const builtModules = moduleIds.flatMap((moduleId) => {
		const rows = moduleRows.filter((row) => row.id === moduleId);
		const head = rows[0];
		if (!head || !isContentStatus(head.status)) return [];
		const text = textPair(
			rows.flatMap((row) =>
				row.locale
					? [{ locale: row.locale, title: row.title ?? "", extra: row.summary }]
					: [],
			),
		);
		const builtTasks = [
			...new Set(
				taskRows
					.filter((row) => row.moduleId === moduleId)
					.map((row) => row.id),
			),
		].flatMap((taskId) => {
			const lines = taskRows.filter((row) => row.id === taskId);
			const task = lines[0];
			if (!task || !isContentStatus(task.status)) return [];
			const words = textPair(
				lines.flatMap((row) =>
					row.locale
						? [
								{
									locale: row.locale,
									title: row.title ?? "",
									extra: row.instructions,
								},
							]
						: [],
				),
			);
			const criteria = criterionRows
				.filter((row) => row.taskId === taskId)
				.map((row) => ({
					id: row.id,
					position: row.position,
					weight: row.weight,
					passThreshold: row.passThreshold,
					promptEn: row.promptEn ?? "",
					promptRw: row.promptRw ?? "",
					missingKinyarwanda: gap(row.promptEn ?? "", row.promptRw ?? ""),
				}));
			return [
				{
					id: task.id,
					position: task.position,
					status: task.status,
					evidenceType: task.evidenceType,
					passThreshold: task.passThreshold,
					required: task.required,
					imageKey: task.imageKey ?? "",
					audioKey: task.audioKey ?? "",
					jobAidKey: task.jobAidKey ?? "",
					outboundUrl: task.outboundUrl ?? "",
					titleEn: words.titleEn,
					titleRw: words.titleRw,
					instructionsEn: words.summaryEn,
					instructionsRw: words.summaryRw,
					missingKinyarwanda:
						gap(words.titleEn, words.titleRw) ||
						gap(words.summaryEn, words.summaryRw) ||
						criteria.some((criterion) => criterion.missingKinyarwanda),
					criteria,
				},
			];
		});
		return [
			{
				id: head.id,
				position: head.position,
				status: head.status,
				titleEn: text.titleEn,
				titleRw: text.titleRw,
				summaryEn: text.summaryEn,
				summaryRw: text.summaryRw,
				requires: prerequisiteRows
					.filter((row) => row.moduleId === head.id)
					.map((row) => row.requiredModuleId),
				missingKinyarwanda:
					gap(text.titleEn, text.titleRw) ||
					gap(text.summaryEn, text.summaryRw) ||
					builtTasks.some((task) => task.missingKinyarwanda),
				tasks: builtTasks,
			},
		];
	});

	const badge = await readBadge(database, courseId);
	return {
		id: courseId,
		status,
		titleEn: courseText.titleEn,
		titleRw: courseText.titleRw,
		summaryEn: courseText.summaryEn,
		summaryRw: courseText.summaryRw,
		category: courseRows[0]?.category ?? "",
		economicSector: courseRows[0]?.economicSector ?? "",
		level: courseRows[0]?.level ?? 1,
		missingKinyarwanda:
			gap(courseText.titleEn, courseText.titleRw) ||
			gap(courseText.summaryEn, courseText.summaryRw) ||
			(badge?.missingKinyarwanda ?? false) ||
			builtModules.some((module) => module.missingKinyarwanda),
		reviewNote: courseRows[0]?.reviewNote ?? "",
		approved: courseRows[0]?.reviewedByUserId != null,
		badge,
		modules: builtModules,
	};
}

async function readBadge(
	database: AuthorDb,
	courseId: string,
): Promise<BadgeView | null> {
	const [row] = await database
		.select()
		.from(badges)
		.where(eq(badges.courseId, courseId))
		.limit(1);
	if (!row || row.titleEn.length === 0) return null;
	const titleRw = row.titleRw ?? "";
	const skillEn = row.skillEn ?? "";
	const skillRw = row.skillRw ?? "";
	return {
		id: row.id,
		titleEn: row.titleEn,
		titleRw,
		skillEn,
		skillRw,
		level: row.level,
		validDays: row.validDays,
		missingKinyarwanda: gap(row.titleEn, titleRw) || gap(skillEn, skillRw),
		requiresInPerson: row.requiresInPerson,
		rule: readBadgeRule(row.rule),
	};
}

function textPair(
	rows: { locale: string; title: string | null; extra: string | null }[],
): {
	titleEn: string;
	titleRw: string;
	summaryEn: string;
	summaryRw: string;
} {
	const english = rows.find((row) => row.locale === "en");
	const kinyarwanda = rows.find((row) => row.locale === "rw");
	return {
		titleEn: english?.title ?? "",
		titleRw: kinyarwanda?.title ?? "",
		summaryEn: english?.extra ?? "",
		summaryRw: kinyarwanda?.extra ?? "",
	};
}

export async function listCourses(
	database: AuthorDb,
): Promise<CourseSummary[]> {
	const rows = await database
		.select({
			id: courses.id,
			status: courses.status,
			locale: courseTranslations.locale,
			title: courseTranslations.title,
		})
		.from(courses)
		.leftJoin(courseTranslations, eq(courseTranslations.courseId, courses.id))
		.orderBy(asc(courses.createdAt));
	const ids = [...new Set(rows.map((row) => row.id))];
	return ids.flatMap((id) => {
		const lines = rows.filter((row) => row.id === id);
		const head = lines[0];
		if (!head || !isContentStatus(head.status)) return [];
		const text = textPair(
			lines.flatMap((row) =>
				row.locale
					? [{ locale: row.locale, title: row.title ?? "", extra: null }]
					: [],
			),
		);
		return [
			{
				id,
				status: head.status,
				title: text.titleEn || text.titleRw,
				missingKinyarwanda: gap(text.titleEn, text.titleRw),
			},
		];
	});
}

async function writeCourseText(
	database: Pick<Database, "insert" | "update">,
	courseId: string,
	input: CourseText & CourseCatalog,
): Promise<void> {
	const titleEn = requireEnglishTitle(clean(input.titleEn));
	const values = [
		{
			courseId,
			locale: "en",
			title: titleEn,
			summary: clean(input.summaryEn) || null,
		},
		{
			courseId,
			locale: "rw",
			title: clean(input.titleRw),
			summary: clean(input.summaryRw) || null,
		},
	];
	for (const value of values) {
		await database
			.insert(courseTranslations)
			.values(value)
			.onConflictDoUpdate({
				target: [courseTranslations.courseId, courseTranslations.locale],
				set: { title: value.title, summary: value.summary },
			});
	}
	const catalog: {
		category?: string;
		economicSector?: string;
		level?: number;
	} = {};
	if (input.category !== undefined) catalog.category = clip(input.category);
	if (input.economicSector !== undefined) {
		catalog.economicSector = clip(input.economicSector);
	}
	if (input.level !== undefined) catalog.level = requireLevel(input.level);
	if (Object.keys(catalog).length > 0) {
		await database.update(courses).set(catalog).where(eq(courses.id, courseId));
	}
}

function clip(value: string): string {
	return clean(value).slice(0, 80);
}

export async function createCourse(
	database: AuthorDb,
	input: CourseText & CourseCatalog & { actorId: number; ip: string },
): Promise<CourseView> {
	const courseId = await database.transaction(async (tx) => {
		const [course] = await tx
			.insert(courses)
			.values({ status: "draft", createdByUserId: input.actorId })
			.returning({ id: courses.id });
		if (!course) throw errors.internal("The course was not stored.");
		await writeCourseText(tx, course.id, input);
		await writeAudit(tx, {
			actorId: input.actorId,
			action: "content.course_created",
			targetType: "course",
			targetId: course.id,
			ipAddress: input.ip,
		});
		return course.id;
	});
	return readCourse(database, courseId);
}

export async function updateCourse(
	database: AuthorDb,
	input: CourseText &
		CourseCatalog & { courseId: string; actorId: number; ip: string },
): Promise<CourseView> {
	await requireDraft(database, input.courseId);
	await writeCourseText(database, input.courseId, input);
	await writeAudit(database, {
		actorId: input.actorId,
		action: "content.course_updated",
		targetType: "course",
		targetId: input.courseId,
		ipAddress: input.ip,
	});
	return readCourse(database, input.courseId);
}

async function writeModuleText(
	database: Pick<Database, "insert">,
	moduleId: string,
	input: CourseText,
): Promise<void> {
	const titleEn = requireEnglishTitle(clean(input.titleEn));
	const values = [
		{
			moduleId,
			locale: "en",
			title: titleEn,
			summary: clean(input.summaryEn) || null,
		},
		{
			moduleId,
			locale: "rw",
			title: clean(input.titleRw),
			summary: clean(input.summaryRw) || null,
		},
	];
	for (const value of values) {
		await database
			.insert(moduleTranslations)
			.values(value)
			.onConflictDoUpdate({
				target: [moduleTranslations.moduleId, moduleTranslations.locale],
				set: { title: value.title, summary: value.summary },
			});
	}
}

export async function createModule(
	database: AuthorDb,
	input: CourseText & { courseId: string; actorId: number; ip: string },
): Promise<CourseView> {
	await requireDraft(database, input.courseId);
	requireEnglishTitle(clean(input.titleEn));
	const position = await nextPosition(database, "module", input.courseId);
	const [created] = await database
		.insert(modules)
		.values({ courseId: input.courseId, position, status: "draft" })
		.returning({ id: modules.id });
	if (!created) throw errors.internal("The module was not stored.");
	await writeModuleText(database, created.id, input);
	await writeAudit(database, {
		actorId: input.actorId,
		action: "content.module_created",
		targetType: "module",
		targetId: created.id,
		ipAddress: input.ip,
	});
	return readCourse(database, input.courseId);
}

export async function updateModule(
	database: ModuleWriteDb,
	input: CourseText & {
		moduleId: string;
		actorId: number;
		ip: string;
		requires?: string[];
	},
): Promise<CourseView> {
	const courseId = await courseIdForModule(database, input.moduleId);
	await requireDraft(database, courseId);
	await writeModuleText(database, input.moduleId, input);
	if (input.requires !== undefined) {
		await writeModuleRequires(
			database,
			courseId,
			input.moduleId,
			input.requires,
		);
	}
	return readCourse(database, courseId);
}

async function writeModuleRequires(
	database: ModuleWriteDb,
	courseId: string,
	moduleId: string,
	requires: string[],
): Promise<void> {
	const rows = await database
		.select({ id: modules.id, position: modules.position })
		.from(modules)
		.where(eq(modules.courseId, courseId));
	const self = rows.find((row) => row.id === moduleId);
	if (!self) throw errors.notFound("That module was not found.");
	const unique = [...new Set(requires)];
	for (const requiredId of unique) {
		const earlier = rows.find((row) => row.id === requiredId);
		if (!earlier || earlier.position >= self.position) {
			throw errors.badRequest("A module can only require an earlier module.", {
				reason: "not_earlier",
			});
		}
	}
	await database
		.delete(modulePrerequisites)
		.where(eq(modulePrerequisites.moduleId, moduleId));
	if (unique.length === 0) return;
	await database.insert(modulePrerequisites).values(
		unique.map((requiredModuleId) => ({
			moduleId,
			requiredModuleId,
		})),
	);
}

type TaskText = {
	titleEn: string;
	titleRw?: string;
	instructionsEn?: string;
	instructionsRw?: string;
	evidenceType?: string;
	passThreshold?: number;
	required?: boolean;
	imageKey?: string;
	audioKey?: string;
	jobAidKey?: string;
	outboundUrl?: string;
};

function storedEvidence(value: string | undefined): string | null {
	const evidence = clean(value);
	if (!evidence) return null;
	if (!isEvidenceType(evidence)) {
		throw errors.badRequest(
			"Choose a photo, a file, a note, or a voice note.",
			{ reason: "unknown_evidence" },
		);
	}
	return evidence;
}

async function writeTaskText(
	database: Pick<Database, "insert" | "update">,
	taskId: string,
	input: TaskText,
): Promise<void> {
	const titleEn = requireEnglishTitle(clean(input.titleEn));
	const values = [
		{
			taskId,
			locale: "en",
			title: titleEn,
			instructions: clean(input.instructionsEn) || null,
		},
		{
			taskId,
			locale: "rw",
			title: clean(input.titleRw),
			instructions: clean(input.instructionsRw) || null,
		},
	];
	for (const value of values) {
		await database
			.insert(taskTranslations)
			.values(value)
			.onConflictDoUpdate({
				target: [taskTranslations.taskId, taskTranslations.locale],
				set: { title: value.title, instructions: value.instructions },
			});
	}
	await database
		.update(tasks)
		.set({
			evidenceType: storedEvidence(input.evidenceType),
			passThreshold: requirePassThreshold(input.passThreshold),
			required: input.required !== false,
			imageKey: await storeMediaKey(input.imageKey, "image/*"),
			audioKey: await storeMediaKey(input.audioKey, "audio/*"),
			jobAidKey: await storeMediaKey(input.jobAidKey, "application/pdf"),
			outboundUrl: storeOutboundUrl(input.outboundUrl),
		})
		.where(eq(tasks.id, taskId));
}

export async function createTask(
	database: AuthorDb,
	input: TaskText & { moduleId: string; actorId: number; ip: string },
): Promise<CourseView> {
	const courseId = await courseIdForModule(database, input.moduleId);
	await requireDraft(database, courseId);
	requireEnglishTitle(clean(input.titleEn));
	const position = await nextPosition(database, "task", input.moduleId);
	const [created] = await database
		.insert(tasks)
		.values({
			moduleId: input.moduleId,
			position,
			status: "draft",
			evidenceType: storedEvidence(input.evidenceType),
		})
		.returning({ id: tasks.id });
	if (!created) throw errors.internal("The task was not stored.");
	await writeTaskText(database, created.id, input);
	await writeAudit(database, {
		actorId: input.actorId,
		action: "content.task_created",
		targetType: "task",
		targetId: created.id,
		ipAddress: input.ip,
	});
	return readCourse(database, courseId);
}

export async function updateTask(
	database: AuthorDb,
	input: TaskText & { taskId: string; actorId: number; ip: string },
): Promise<CourseView> {
	const courseId = await courseIdForTask(database, input.taskId);
	await requireDraft(database, courseId);
	await writeTaskText(database, input.taskId, input);
	return readCourse(database, courseId);
}

function requireWeight(weight: number): number {
	if (!Number.isInteger(weight) || weight <= 0) {
		throw errors.badRequest("Enter a weight above zero.", {
			reason: "weight_required",
		});
	}
	return weight;
}

export async function createCriterion(
	database: AuthorDb,
	input: {
		taskId: string;
		weight: number;
		passThreshold?: number;
		promptEn: string;
		promptRw?: string;
		actorId: number;
		ip: string;
	},
): Promise<CourseView> {
	const courseId = await courseIdForTask(database, input.taskId);
	await requireDraft(database, courseId);
	const promptEn = requireEnglishTitle(clean(input.promptEn));
	const position = await nextPosition(database, "criterion", input.taskId);
	const [created] = await database
		.insert(rubricCriteria)
		.values({
			taskId: input.taskId,
			position,
			weight: requireWeight(input.weight),
			passThreshold: requirePassThreshold(input.passThreshold),
			promptEn,
			promptRw: clean(input.promptRw) || null,
		})
		.returning({ id: rubricCriteria.id });
	if (!created) throw errors.internal("The criterion was not stored.");
	await writeAudit(database, {
		actorId: input.actorId,
		action: "content.criterion_created",
		targetType: "rubric_criterion",
		targetId: created.id,
		ipAddress: input.ip,
	});
	return readCourse(database, courseId);
}

export async function updateCriterion(
	database: AuthorDb,
	input: {
		criterionId: string;
		weight: number;
		passThreshold?: number;
		promptEn: string;
		promptRw?: string;
		actorId: number;
		ip: string;
	},
): Promise<CourseView> {
	const courseId = await courseIdForCriterion(database, input.criterionId);
	await requireDraft(database, courseId);
	await database
		.update(rubricCriteria)
		.set({
			weight: requireWeight(input.weight),
			passThreshold: requirePassThreshold(input.passThreshold),
			promptEn: requireEnglishTitle(clean(input.promptEn)),
			promptRw: clean(input.promptRw) || null,
		})
		.where(eq(rubricCriteria.id, input.criterionId));
	return readCourse(database, courseId);
}

export async function saveBadge(
	database: AuthorDb,
	input: {
		courseId: string;
		titleEn: string;
		titleRw?: string;
		skillEn?: string;
		skillRw?: string;
		level: number;
		validDays?: number | null;
		allRequiredTasksApproved: boolean;
		minimumScore?: number | null;
		minimumHours?: number | null;
		requiresInPerson?: boolean;
		actorId: number;
		ip: string;
	},
): Promise<CourseView> {
	await requireDraft(database, input.courseId);
	const titleEn = requireEnglishTitle(clean(input.titleEn));
	const titleRw = clean(input.titleRw) || null;
	const skillEn = cleanSkill(input.skillEn);
	const skillRw = cleanSkill(input.skillRw);
	const rule = requireBadgeRule(input);
	const level = requireLevel(input.level);
	const validDays = requireValidDays(input.validDays);
	const requiresInPerson = input.requiresInPerson === true;
	const [saved] = await database
		.insert(badges)
		.values({
			courseId: input.courseId,
			titleEn,
			titleRw,
			skillEn,
			skillRw,
			level,
			validDays,
			requiresInPerson,
			rule,
		})
		.onConflictDoUpdate({
			target: badges.courseId,
			set: {
				titleEn,
				titleRw,
				skillEn,
				skillRw,
				level,
				validDays,
				requiresInPerson,
				rule,
			},
		})
		.returning({ id: badges.id });
	if (!saved) throw errors.internal("The badge was not stored.");
	await writeAudit(database, {
		actorId: input.actorId,
		action: "content.badge_saved",
		targetType: "badge",
		targetId: saved.id,
		ipAddress: input.ip,
	});
	return readCourse(database, input.courseId);
}

export async function submitCourseForReview(
	database: AuthorDb,
	input: { courseId: string; actorId: number; ip: string },
): Promise<CourseView> {
	await requireDraft(database, input.courseId);
	const course = await readCourse(database, input.courseId);
	const ready = course.modules.some((module) => module.tasks.length > 0);
	const complete =
		ready &&
		course.modules.every((module) =>
			module.tasks.every(
				(task) =>
					task.evidenceType !== null &&
					isEvidenceType(task.evidenceType) &&
					task.criteria.some(
						(criterion) =>
							criterion.weight > 0 && criterion.promptEn.length > 0,
					),
			),
		);
	if (!complete) {
		throw errors.badRequest(
			"Add an evidence type and a rubric to every task before submitting.",
			{ reason: "incomplete" },
		);
	}
	await database.transaction(async (tx) => {
		await tx
			.update(courses)
			.set({
				status: "in_review",
				reviewedByUserId: null,
				reviewedAt: null,
				reviewNote: null,
			})
			.where(eq(courses.id, input.courseId));
		await tx
			.update(modules)
			.set({ status: "in_review" })
			.where(eq(modules.courseId, input.courseId));
		const moduleIds = course.modules.map((module) => module.id);
		if (moduleIds.length > 0) {
			await tx
				.update(tasks)
				.set({ status: "in_review" })
				.where(inArray(tasks.moduleId, moduleIds));
		}
		await writeAudit(tx, {
			actorId: input.actorId,
			action: "content.submitted",
			targetType: "course",
			targetId: input.courseId,
			ipAddress: input.ip,
		});
		await writeEvent(tx, {
			name: "content.submitted_for_review",
			payload: { courseId: input.courseId },
		});
	});
	return readCourse(database, input.courseId);
}

/** Open a working draft from a published course. The pinned snapshot stays as it was. */
export async function openNextDraft(
	database: AuthorDb,
	input: { courseId: string; actorId: number; ip: string },
): Promise<CourseView> {
	const course = await requireCourse(database, input.courseId);
	if (course.status !== "published") {
		throw errors.conflict("Only a published course can start another draft.", {
			reason: "not_published",
		});
	}
	const current = await readCourse(database, input.courseId);
	await database.transaction(async (tx) => {
		await tx
			.update(courses)
			.set({
				status: "draft",
				reviewedByUserId: null,
				reviewedAt: null,
				reviewNote: null,
			})
			.where(eq(courses.id, input.courseId));
		await tx
			.update(modules)
			.set({ status: "draft", retiredAt: null })
			.where(eq(modules.courseId, input.courseId));
		const moduleIds = current.modules.map((module) => module.id);
		if (moduleIds.length > 0) {
			await tx
				.update(tasks)
				.set({ status: "draft", retiredAt: null })
				.where(inArray(tasks.moduleId, moduleIds));
		}
		await writeAudit(tx, {
			actorId: input.actorId,
			action: "content.draft_opened",
			targetType: "course",
			targetId: input.courseId,
			ipAddress: input.ip,
		});
		await writeEvent(tx, {
			name: "content.next_draft",
			payload: { courseId: input.courseId },
		});
	});
	return readCourse(database, input.courseId);
}
