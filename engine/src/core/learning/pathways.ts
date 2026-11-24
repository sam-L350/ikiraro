import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Database } from "../../db";
import {
	courses,
	courseTranslations,
	pathwayCourses,
	pathways,
	placementAnswers,
	placementChoices,
	placementQuestions,
	placementResults,
	pointTransactions,
} from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit } from "../audit/write";

type PathwayDb = Pick<Database, "insert" | "select" | "transaction">;

const TITLE_LIMIT = 120;
const PROMPT_LIMIT = 200;
const LABEL_LIMIT = 80;

export type PathwayCourse = {
	id: string;
	position: number;
	titleEn: string;
	titleRw: string;
	finished: boolean;
};

export type PathwayView = {
	id: string;
	titleEn: string;
	titleRw: string;
	courses: PathwayCourse[];
	nextCourseId: string | null;
};

export type PlacementChoiceView = {
	id: string;
	position: number;
	labelEn: string;
	labelRw: string;
	courseId: string;
};

export type PlacementQuestionView = {
	id: string;
	position: number;
	promptEn: string;
	promptRw: string;
	choices: PlacementChoiceView[];
};

export type CourseOption = {
	id: string;
	titleEn: string;
	titleRw: string;
};

export type PlacementSuggestion = {
	courseId: string;
	titleEn: string;
	titleRw: string;
};

function requiredLine(
	value: string,
	limit: number,
	message: string,
	reason: "pathway" | "placement",
): string {
	const trimmed = value.trim();
	if (!trimmed || trimmed.length > limit) {
		throw errors.badRequest(message, { reason });
	}
	return trimmed;
}

async function publishedIds(
	database: Pick<Database, "select">,
	ids: readonly string[],
): Promise<Set<string>> {
	if (ids.length === 0) return new Set();
	const rows = await database
		.select({ id: courses.id })
		.from(courses)
		.where(and(inArray(courses.id, [...ids]), eq(courses.status, "published")));
	return new Set(rows.map((row) => row.id));
}

function titlesOf(
	rows: { courseId: string; locale: string; title: string }[],
): Map<string, { titleEn: string; titleRw: string }> {
	const titles = new Map<string, { titleEn: string; titleRw: string }>();
	for (const row of rows) {
		const current = titles.get(row.courseId) ?? { titleEn: "", titleRw: "" };
		if (row.locale === "en") current.titleEn = row.title;
		if (row.locale === "rw") current.titleRw = row.title;
		titles.set(row.courseId, current);
	}
	return titles;
}

/** Store a pathway. The array order is the order a learner follows. */
export async function createPathway(
	database: PathwayDb,
	input: {
		actorId: number;
		titleEn: string;
		titleRw: string;
		courseIds: string[];
		ip: string;
	},
): Promise<{ id: string }> {
	const titleEn = requiredLine(
		input.titleEn,
		TITLE_LIMIT,
		"Write the English title.",
		"pathway",
	);
	const titleRw = requiredLine(
		input.titleRw,
		TITLE_LIMIT,
		"Write the Kinyarwanda title.",
		"pathway",
	);
	const courseIds = input.courseIds.map((id) => id.trim()).filter(Boolean);
	if (courseIds.length < 2) {
		throw errors.badRequest("Add the courses in order.", { reason: "pathway" });
	}
	if (new Set(courseIds).size !== courseIds.length) {
		throw errors.badRequest("A course is listed once.", { reason: "pathway" });
	}
	const live = await publishedIds(database, courseIds);
	if (courseIds.some((id) => !live.has(id))) {
		throw errors.badRequest("Choose a published course.", { reason: "course" });
	}
	const created = await database.transaction(async (tx) => {
		const [pathway] = await tx
			.insert(pathways)
			.values({ titleEn, titleRw, createdByUserId: input.actorId })
			.returning({ id: pathways.id });
		if (!pathway) throw errors.internal("The pathway could not be stored.");
		await tx.insert(pathwayCourses).values(
			courseIds.map((courseId, index) => ({
				pathwayId: pathway.id,
				courseId,
				position: index + 1,
			})),
		);
		await writeAudit(tx, {
			actorId: input.actorId,
			action: "pathway.created",
			targetType: "pathway",
			targetId: pathway.id,
			ipAddress: input.ip,
			metadata: { courses: courseIds.length },
		});
		return pathway;
	});
	return { id: created.id };
}

/** Pathways in the author's order, and the next course this person has not finished. */
export async function readPathways(
	database: Pick<Database, "select">,
	userId: number,
	canWrite: boolean,
): Promise<{
	pathways: PathwayView[];
	canWrite: boolean;
	courses: CourseOption[];
}> {
	const rows = await database
		.select({
			id: pathways.id,
			titleEn: pathways.titleEn,
			titleRw: pathways.titleRw,
			courseId: pathwayCourses.courseId,
			position: pathwayCourses.position,
		})
		.from(pathways)
		.leftJoin(pathwayCourses, eq(pathwayCourses.pathwayId, pathways.id))
		.orderBy(asc(pathways.createdAt), asc(pathwayCourses.position));
	const courseIds = [
		...new Set(rows.flatMap((row) => (row.courseId ? [row.courseId] : []))),
	];
	const titleRows =
		courseIds.length === 0
			? []
			: await database
					.select({
						courseId: courseTranslations.courseId,
						locale: courseTranslations.locale,
						title: courseTranslations.title,
					})
					.from(courseTranslations)
					.where(inArray(courseTranslations.courseId, courseIds));
	const titles = titlesOf(titleRows);
	const finishedRows = await database
		.select({ id: pointTransactions.referenceId })
		.from(pointTransactions)
		.where(
			and(
				eq(pointTransactions.userId, userId),
				eq(pointTransactions.kind, "course_completed"),
				eq(pointTransactions.referenceType, "course"),
			),
		);
	const finished = new Set(finishedRows.map((row) => row.id));
	const grouped = new Map<string, PathwayView>();
	for (const row of rows) {
		let pathway = grouped.get(row.id);
		if (!pathway) {
			pathway = {
				id: row.id,
				titleEn: row.titleEn,
				titleRw: row.titleRw,
				courses: [],
				nextCourseId: null,
			};
			grouped.set(row.id, pathway);
		}
		if (!row.courseId || row.position === null) continue;
		const title = titles.get(row.courseId) ?? { titleEn: "", titleRw: "" };
		pathway.courses.push({
			id: row.courseId,
			position: row.position,
			titleEn: title.titleEn,
			titleRw: title.titleRw,
			finished: finished.has(row.courseId),
		});
	}
	for (const pathway of grouped.values()) {
		pathway.nextCourseId =
			pathway.courses.find((course) => !course.finished)?.id ?? null;
	}
	return {
		pathways: [...grouped.values()],
		canWrite,
		courses: canWrite ? await publishedCourses(database) : [],
	};
}

async function publishedCourses(
	database: Pick<Database, "select">,
): Promise<CourseOption[]> {
	const rows = await database
		.select({
			id: courses.id,
			locale: courseTranslations.locale,
			title: courseTranslations.title,
		})
		.from(courses)
		.leftJoin(courseTranslations, eq(courseTranslations.courseId, courses.id))
		.where(eq(courses.status, "published"))
		.orderBy(asc(courses.createdAt));
	const grouped = new Map<string, CourseOption>();
	for (const row of rows) {
		const current = grouped.get(row.id) ?? {
			id: row.id,
			titleEn: "",
			titleRw: "",
		};
		if (row.locale === "en" && row.title) current.titleEn = row.title;
		if (row.locale === "rw" && row.title) current.titleRw = row.title;
		grouped.set(row.id, current);
	}
	return [...grouped.values()];
}

async function questionRows(
	database: Pick<Database, "select">,
): Promise<PlacementQuestionView[]> {
	const rows = await database
		.select({
			id: placementQuestions.id,
			position: placementQuestions.position,
			promptEn: placementQuestions.promptEn,
			promptRw: placementQuestions.promptRw,
			choiceId: placementChoices.id,
			choicePosition: placementChoices.position,
			labelEn: placementChoices.labelEn,
			labelRw: placementChoices.labelRw,
			courseId: placementChoices.courseId,
		})
		.from(placementQuestions)
		.leftJoin(
			placementChoices,
			eq(placementChoices.questionId, placementQuestions.id),
		)
		.orderBy(asc(placementQuestions.position), asc(placementChoices.position));
	const grouped = new Map<string, PlacementQuestionView>();
	for (const row of rows) {
		let question = grouped.get(row.id);
		if (!question) {
			question = {
				id: row.id,
				position: row.position,
				promptEn: row.promptEn,
				promptRw: row.promptRw,
				choices: [],
			};
			grouped.set(row.id, question);
		}
		if (!row.choiceId || row.choicePosition === null || !row.courseId) continue;
		question.choices.push({
			id: row.choiceId,
			position: row.choicePosition,
			labelEn: row.labelEn ?? "",
			labelRw: row.labelRw ?? "",
			courseId: row.courseId,
		});
	}
	return [...grouped.values()];
}

/** The check, with no suggestion. Registration can show this before an account exists. */
export async function readPlacementQuestions(
	database: Pick<Database, "select">,
): Promise<{ questions: PlacementQuestionView[] }> {
	return { questions: await questionRows(database) };
}

/** This person's check and the course it suggested, if they have answered. */
export async function readPlacement(
	database: Pick<Database, "select">,
	userId: number,
	canWrite: boolean,
): Promise<{
	questions: PlacementQuestionView[];
	suggestion: PlacementSuggestion | null;
	canWrite: boolean;
	courses: CourseOption[];
}> {
	const questions = await questionRows(database);
	const [latest] = await database
		.select({
			courseId: placementResults.courseId,
			titleEn: courseTranslations.title,
		})
		.from(placementResults)
		.leftJoin(
			courseTranslations,
			and(
				eq(courseTranslations.courseId, placementResults.courseId),
				eq(courseTranslations.locale, "en"),
			),
		)
		.where(eq(placementResults.userId, userId))
		.orderBy(desc(placementResults.createdAt))
		.limit(1);
	let suggestion: PlacementSuggestion | null = null;
	if (latest) {
		const [rw] = await database
			.select({ title: courseTranslations.title })
			.from(courseTranslations)
			.where(
				and(
					eq(courseTranslations.courseId, latest.courseId),
					eq(courseTranslations.locale, "rw"),
				),
			)
			.limit(1);
		suggestion = {
			courseId: latest.courseId,
			titleEn: latest.titleEn ?? "",
			titleRw: rw?.title ?? "",
		};
	}
	return {
		questions,
		suggestion,
		canWrite,
		courses: canWrite ? await publishedCourses(database) : [],
	};
}

/** Add one part of the check. Each choice names a published course. */
export async function createPlacementQuestion(
	database: PathwayDb,
	input: {
		actorId: number;
		promptEn: string;
		promptRw: string;
		choices: { labelEn: string; labelRw: string; courseId: string }[];
		ip: string;
	},
): Promise<{ id: string }> {
	const promptEn = requiredLine(
		input.promptEn,
		PROMPT_LIMIT,
		"Write the check.",
		"placement",
	);
	const promptRw = requiredLine(
		input.promptRw,
		PROMPT_LIMIT,
		"Write the check.",
		"placement",
	);
	if (input.choices.length < 2) {
		throw errors.badRequest("Add a choice for each course.", {
			reason: "placement",
		});
	}
	const choices = input.choices.map((choice) => ({
		labelEn: requiredLine(
			choice.labelEn,
			LABEL_LIMIT,
			"Write the check.",
			"placement",
		),
		labelRw: requiredLine(
			choice.labelRw,
			LABEL_LIMIT,
			"Write the check.",
			"placement",
		),
		courseId: choice.courseId.trim(),
	}));
	const live = await publishedIds(
		database,
		choices.map((choice) => choice.courseId),
	);
	if (choices.some((choice) => !live.has(choice.courseId))) {
		throw errors.badRequest("Choose a published course.", { reason: "course" });
	}
	const created = await database.transaction(async (tx) => {
		const [last] = await tx
			.select({ position: placementQuestions.position })
			.from(placementQuestions)
			.orderBy(desc(placementQuestions.position))
			.limit(1);
		const [question] = await tx
			.insert(placementQuestions)
			.values({
				promptEn,
				promptRw,
				position: (last?.position ?? 0) + 1,
				createdByUserId: input.actorId,
			})
			.returning({ id: placementQuestions.id });
		if (!question) throw errors.internal("The check could not be stored.");
		await tx.insert(placementChoices).values(
			choices.map((choice, index) => ({
				questionId: question.id,
				labelEn: choice.labelEn,
				labelRw: choice.labelRw,
				courseId: choice.courseId,
				position: index + 1,
			})),
		);
		await writeAudit(tx, {
			actorId: input.actorId,
			action: "placement.question_created",
			targetType: "placement_question",
			targetId: question.id,
			ipAddress: input.ip,
			metadata: { choices: choices.length },
		});
		return question;
	});
	return { id: created.id };
}

/**
 * The course named by the most answers. A tie uses the course on the earliest
 * question. Every question needs one of its own choices.
 */
export function suggestedCourseId(
	questions: readonly PlacementQuestionView[],
	choiceIds: readonly string[],
): string {
	if (questions.length === 0) {
		throw errors.badRequest("There is no check to answer.", {
			reason: "placement",
		});
	}
	const chosen = new Set(choiceIds);
	if (chosen.size !== choiceIds.length || chosen.size !== questions.length) {
		throw errors.badRequest("Answer each part of the check.", {
			reason: "placement",
		});
	}
	const picks: { position: number; courseId: string }[] = [];
	for (const question of questions) {
		const match = question.choices.filter((choice) => chosen.has(choice.id));
		const pick = match[0];
		if (match.length !== 1 || !pick) {
			throw errors.badRequest("Answer each part of the check.", {
				reason: "placement",
			});
		}
		picks.push({ position: question.position, courseId: pick.courseId });
	}
	const counts = new Map<string, { count: number; position: number }>();
	for (const pick of picks) {
		const current = counts.get(pick.courseId);
		if (!current) {
			counts.set(pick.courseId, { count: 1, position: pick.position });
			continue;
		}
		current.count += 1;
		if (pick.position < current.position) current.position = pick.position;
	}
	let winner = "";
	let best = { count: 0, position: Number.POSITIVE_INFINITY };
	for (const [courseId, score] of counts) {
		if (
			score.count > best.count ||
			(score.count === best.count && score.position < best.position)
		) {
			winner = courseId;
			best = score;
		}
	}
	if (!winner) {
		throw errors.badRequest("Answer each part of the check.", {
			reason: "placement",
		});
	}
	return winner;
}

async function suggestionFor(
	database: Pick<Database, "select">,
	courseId: string,
): Promise<PlacementSuggestion> {
	const [en] = await database
		.select({ title: courseTranslations.title })
		.from(courseTranslations)
		.where(
			and(
				eq(courseTranslations.courseId, courseId),
				eq(courseTranslations.locale, "en"),
			),
		)
		.limit(1);
	const [rw] = await database
		.select({ title: courseTranslations.title })
		.from(courseTranslations)
		.where(
			and(
				eq(courseTranslations.courseId, courseId),
				eq(courseTranslations.locale, "rw"),
			),
		)
		.limit(1);
	return {
		courseId,
		titleEn: en?.title ?? "",
		titleRw: rw?.title ?? "",
	};
}

/** Store the check on the caller's transaction. A second check is refused. */
export async function storePlacement(
	database: Pick<Database, "insert" | "select">,
	input: { userId: number; choiceIds: string[]; ip: string },
): Promise<PlacementSuggestion | null> {
	if (input.choiceIds.length === 0) return null;
	const questions = await questionRows(database);
	const courseId = suggestedCourseId(questions, input.choiceIds);
	const [existing] = await database
		.select({ id: placementResults.id })
		.from(placementResults)
		.where(eq(placementResults.userId, input.userId))
		.limit(1);
	if (existing) {
		throw errors.conflict("The check is already stored.", {
			reason: "placement",
		});
	}
	await database.insert(placementAnswers).values(
		input.choiceIds.map((choiceId) => ({
			userId: input.userId,
			choiceId,
		})),
	);
	await database.insert(placementResults).values({
		userId: input.userId,
		courseId,
	});
	await writeAudit(database, {
		actorId: input.userId,
		action: "placement.answered",
		targetType: "course",
		targetId: courseId,
		ipAddress: input.ip,
		metadata: {},
	});
	return suggestionFor(database, courseId);
}

/** Store the check and the course it suggests. A second check is refused. */
export async function answerPlacement(
	database: PathwayDb,
	input: { userId: number; choiceIds: string[]; ip: string },
): Promise<PlacementSuggestion> {
	const stored = await database.transaction(async (tx) =>
		storePlacement(tx, input),
	);
	if (!stored) {
		throw errors.badRequest("Answer each part of the check.", {
			reason: "placement",
		});
	}
	return stored;
}
