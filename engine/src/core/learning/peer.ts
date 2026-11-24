import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "../../db";
import {
	contentVersions,
	enrollments,
	learningCenters,
	roles,
	sectors,
	taskAnswerDecisions,
	taskAnswers,
	taskGroupCredits,
	taskGroupMembers,
	taskGroupRules,
	taskGroups,
	taskQuestions,
	taskSamples,
	taskSubmissions,
	tasks,
	userRoles,
	users,
} from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit } from "../audit/write";
import { isRoleCode, ROLE_PERMISSIONS } from "../authz/catalog";
import type { Assignment, ScopeType } from "../authz/decide";
import {
	centerStaffByRole,
	expandCenterAssignments,
} from "../geography/centers";
import { parseProgressSnapshot } from "./progress";

type PeerDb = Pick<Database, "insert" | "select" | "transaction">;

export type PracticeSample = {
	titleEn: string;
	titleRw: string;
	bodyEn: string;
	bodyRw: string;
};

export type AnswerStatus = "pending" | "shown" | "hidden";

export type AnswerView = {
	id: string;
	authorName: string;
	body: string;
	status: AnswerStatus;
	mine: boolean;
};

export type QuestionView = {
	id: string;
	authorName: string;
	body: string;
	mine: boolean;
	answers: AnswerView[];
};

export type QuestionQueueRow = {
	taskId: string;
	questionId: string;
	answerId: string | null;
	questionBody: string;
	answerBody: string;
	authorName: string;
};

export type GroupMemberView = {
	userId: number;
	name: string;
	did: string;
	mine: boolean;
};

export type Classmate = { userId: number; name: string };

export type GroupView = {
	id: string;
	kind: "cooperative" | "family";
	name: string;
	createdByMe: boolean;
	members: GroupMemberView[];
};

type Place = { centerId: string; districtId: string; courseId: string };

function line(
	value: string,
	limit: number,
	message: string,
	reason: "practice" | "question" | "group",
): string {
	const trimmed = value.trim();
	if (!trimmed || trimmed.length > limit) {
		throw errors.badRequest(message, { reason });
	}
	return trimmed;
}

async function taskExists(
	database: Pick<Database, "select">,
	taskId: string,
): Promise<void> {
	const [row] = await database
		.select({ id: tasks.id })
		.from(tasks)
		.where(eq(tasks.id, taskId))
		.limit(1);
	if (!row) throw errors.notFound("This task was not found.");
}

async function enrolled(
	database: Pick<Database, "select">,
	userId: number,
	taskId: string,
): Promise<Place | null> {
	const rows = await database
		.select({
			courseId: enrollments.courseId,
			centerId: enrollments.centerId,
			districtId: sectors.districtId,
			snapshot: contentVersions.snapshot,
		})
		.from(enrollments)
		.innerJoin(
			contentVersions,
			eq(contentVersions.id, enrollments.contentVersionId),
		)
		.innerJoin(learningCenters, eq(learningCenters.id, enrollments.centerId))
		.innerJoin(sectors, eq(sectors.id, learningCenters.sectorId))
		.where(eq(enrollments.userId, userId));
	for (const row of rows) {
		const match = parseProgressSnapshot(row.snapshot).some((module) =>
			module.tasks.some((task) => task.id === taskId),
		);
		if (!match) continue;
		return {
			centerId: row.centerId,
			districtId: row.districtId,
			courseId: row.courseId,
		};
	}
	return null;
}

async function namesOf(
	database: Pick<Database, "select">,
	ids: number[],
): Promise<Map<number, string>> {
	const names = new Map<number, string>();
	if (ids.length === 0) return names;
	const rows = await database
		.select({ id: users.id, name: users.name })
		.from(users)
		.where(inArray(users.id, ids));
	for (const row of rows) names.set(row.id, row.name?.trim() || "");
	return names;
}

function isScopeType(value: string): value is ScopeType {
	return (
		value === "self" ||
		value === "center" ||
		value === "district" ||
		value === "global"
	);
}

async function assignmentsOf(
	database: Pick<Database, "select">,
	userId: number,
): Promise<Assignment[]> {
	const rows = await database
		.select({
			code: roles.code,
			scopeType: userRoles.scopeType,
			scopeId: userRoles.scopeId,
		})
		.from(userRoles)
		.innerJoin(roles, eq(roles.id, userRoles.roleId))
		.where(and(eq(userRoles.userId, userId), isNull(userRoles.suspendedAt)));
	const stored = rows.flatMap((row) => {
		if (!isRoleCode(row.code) || !isScopeType(row.scopeType)) return [];
		return [
			{
				role: row.code,
				scopeType: row.scopeType,
				scopeId: row.scopeId,
			},
		];
	});
	return expandCenterAssignments(
		stored,
		await centerStaffByRole(database, userId),
	);
}

async function canWrite(
	database: Pick<Database, "select">,
	userId: number,
): Promise<boolean> {
	const assignments = await assignmentsOf(database, userId);
	return assignments.some(
		(assignment) =>
			ROLE_PERMISSIONS[assignment.role].includes("content.write") &&
			assignment.scopeType === "global",
	);
}

/** Null means every center. An empty list means this person reviews nowhere. */
async function reviewCenters(
	database: Pick<Database, "select">,
	userId: number,
): Promise<string[] | null> {
	const assignments = await assignmentsOf(database, userId);
	const holders = assignments.filter((assignment) =>
		ROLE_PERMISSIONS[assignment.role].includes("submission.review"),
	);
	if (holders.length === 0) return [];
	if (holders.some((assignment) => assignment.scopeType === "global")) {
		return null;
	}
	const centers = new Set<string>();
	const districtIds: string[] = [];
	for (const assignment of holders) {
		if (!assignment.scopeId) continue;
		if (assignment.scopeType === "center") centers.add(assignment.scopeId);
		if (assignment.scopeType === "district")
			districtIds.push(assignment.scopeId);
	}
	if (districtIds.length > 0) {
		const rows = await database
			.select({ id: learningCenters.id })
			.from(learningCenters)
			.innerJoin(sectors, eq(sectors.id, learningCenters.sectorId))
			.where(inArray(sectors.districtId, districtIds));
		for (const row of rows) centers.add(row.id);
	}
	return [...centers];
}

function covers(centers: string[] | null, centerId: string): boolean {
	return centers === null || centers.includes(centerId);
}

async function finishedTask(
	database: Pick<Database, "select">,
	userId: number,
	taskId: string,
): Promise<boolean> {
	const [row] = await database
		.select({ id: taskSubmissions.id })
		.from(taskSubmissions)
		.where(
			and(
				eq(taskSubmissions.ownerUserId, userId),
				eq(taskSubmissions.taskId, taskId),
				eq(taskSubmissions.status, "approved"),
			),
		)
		.limit(1);
	return Boolean(row);
}

export async function readPractice(
	database: PeerDb,
	userId: number,
	taskId: string,
): Promise<{ sample: PracticeSample | null; canWrite: boolean }> {
	await taskExists(database, taskId);
	const writer = await canWrite(database, userId);
	const place = await enrolled(database, userId, taskId);
	const centers = await reviewCenters(database, userId);
	const reviewer = place ? covers(centers, place.centerId) : centers === null;
	if (!writer && !place && !reviewer) {
		throw errors.forbidden("Enroll in this course first.", {
			reason: "practice",
		});
	}
	const [row] = await database
		.select({
			titleEn: taskSamples.titleEn,
			titleRw: taskSamples.titleRw,
			bodyEn: taskSamples.bodyEn,
			bodyRw: taskSamples.bodyRw,
		})
		.from(taskSamples)
		.where(eq(taskSamples.taskId, taskId))
		.orderBy(desc(taskSamples.createdAt))
		.limit(1);
	return { sample: row ?? null, canWrite: writer };
}

export async function createPractice(
	database: PeerDb,
	input: {
		actorId: number;
		taskId: string;
		titleEn: string;
		titleRw: string;
		bodyEn: string;
		bodyRw: string;
		ip: string;
	},
): Promise<PracticeSample> {
	if (!(await canWrite(database, input.actorId))) {
		throw errors.forbidden("An author stores the sample.", {
			reason: "practice",
		});
	}
	await taskExists(database, input.taskId);
	const sample: PracticeSample = {
		titleEn: line(input.titleEn, 120, "Write the English title.", "practice"),
		titleRw: line(
			input.titleRw,
			120,
			"Write the Kinyarwanda title.",
			"practice",
		),
		bodyEn: line(input.bodyEn, 2000, "Write the sample.", "practice"),
		bodyRw: line(input.bodyRw, 2000, "Write the sample.", "practice"),
	};
	await database.transaction(async (tx) => {
		const [row] = await tx
			.insert(taskSamples)
			.values({
				...sample,
				taskId: input.taskId,
				createdByUserId: input.actorId,
			})
			.returning({ id: taskSamples.id });
		await writeAudit(tx, {
			actorId: input.actorId,
			action: "task_sample.store",
			targetType: "task",
			targetId: input.taskId,
			ipAddress: input.ip,
			metadata: { sampleId: row?.id ?? "" },
		});
	});
	return sample;
}

type AnswerRow = {
	id: string;
	questionId: string;
	userId: number;
	body: string;
	createdAt: Date;
};

function statusOf(
	decisions: { answerId: string; shown: boolean; createdAt: Date }[],
	answerId: string,
): AnswerStatus {
	const latest = decisions
		.filter((row) => row.answerId === answerId)
		.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
	if (!latest) return "pending";
	return latest.shown ? "shown" : "hidden";
}

export async function readQuestions(
	database: PeerDb,
	userId: number,
	taskId: string,
): Promise<{
	questions: QuestionView[];
	canAsk: boolean;
	canAnswer: boolean;
	canReview: boolean;
}> {
	await taskExists(database, taskId);
	const place = await enrolled(database, userId, taskId);
	const centers = await reviewCenters(database, userId);
	const canAsk = place !== null;
	const canReview = place ? covers(centers, place.centerId) : false;
	if (!canAsk && !canReview && !(await canWrite(database, userId))) {
		throw errors.forbidden("Enroll in this course first.", {
			reason: "question",
		});
	}
	const advanced = await finishedTask(database, userId, taskId);
	const questions = await database
		.select({
			id: taskQuestions.id,
			userId: taskQuestions.userId,
			body: taskQuestions.body,
			createdAt: taskQuestions.createdAt,
		})
		.from(taskQuestions)
		.where(eq(taskQuestions.taskId, taskId))
		.orderBy(asc(taskQuestions.createdAt));
	const questionIds = questions.map((question) => question.id);
	const answers: AnswerRow[] =
		questionIds.length === 0
			? []
			: await database
					.select({
						id: taskAnswers.id,
						questionId: taskAnswers.questionId,
						userId: taskAnswers.userId,
						body: taskAnswers.body,
						createdAt: taskAnswers.createdAt,
					})
					.from(taskAnswers)
					.where(inArray(taskAnswers.questionId, questionIds))
					.orderBy(asc(taskAnswers.createdAt));
	const answerIds = answers.map((answer) => answer.id);
	const decisions =
		answerIds.length === 0
			? []
			: await database
					.select({
						answerId: taskAnswerDecisions.answerId,
						shown: taskAnswerDecisions.shown,
						createdAt: taskAnswerDecisions.createdAt,
					})
					.from(taskAnswerDecisions)
					.where(inArray(taskAnswerDecisions.answerId, answerIds));
	const nameIds = [
		...questions.map((question) => question.userId),
		...answers.map((answer) => answer.userId),
	];
	const names = await namesOf(database, [...new Set(nameIds)]);
	return {
		canAsk,
		canAnswer: canReview || advanced,
		canReview,
		questions: questions.map((question) => ({
			id: question.id,
			authorName: names.get(question.userId) ?? "",
			body: question.body,
			mine: question.userId === userId,
			answers: answers
				.filter((answer) => answer.questionId === question.id)
				.flatMap((answer) => {
					const status = statusOf(decisions, answer.id);
					const mine = answer.userId === userId;
					if (status !== "shown" && !mine && !canReview) return [];
					return [
						{
							id: answer.id,
							authorName: names.get(answer.userId) ?? "",
							body: answer.body,
							status,
							mine,
						},
					];
				}),
		})),
	};
}

export async function askQuestion(
	database: PeerDb,
	input: { userId: number; taskId: string; body: string; ip: string },
): Promise<{ id: string }> {
	await taskExists(database, input.taskId);
	const place = await enrolled(database, input.userId, input.taskId);
	if (!place) {
		throw errors.forbidden("Enroll in this course first.", {
			reason: "question",
		});
	}
	const body = line(input.body, 400, "Write the question.", "question");
	return database.transaction(async (tx) => {
		const [row] = await tx
			.insert(taskQuestions)
			.values({ taskId: input.taskId, userId: input.userId, body })
			.returning({ id: taskQuestions.id });
		if (!row) throw errors.internal();
		await writeAudit(tx, {
			actorId: input.userId,
			action: "task_question.ask",
			targetType: "task",
			targetId: input.taskId,
			ipAddress: input.ip,
			metadata: { questionId: row.id },
		});
		return { id: row.id };
	});
}

async function answerAllowed(
	database: PeerDb,
	userId: number,
	taskId: string,
	place: Place,
): Promise<void> {
	const centers = await reviewCenters(database, userId);
	if (covers(centers, place.centerId)) return;
	if (await finishedTask(database, userId, taskId)) return;
	throw errors.forbidden(
		"A trainer or someone who finished this task can answer.",
		{ reason: "question" },
	);
}

export async function answerQuestion(
	database: PeerDb,
	input: {
		userId: number;
		taskId: string;
		questionId: string;
		body: string;
		ip: string;
	},
): Promise<{ id: string }> {
	const body = line(input.body, 400, "Write the answer.", "question");
	const [question] = await database
		.select({
			id: taskQuestions.id,
			taskId: taskQuestions.taskId,
			userId: taskQuestions.userId,
		})
		.from(taskQuestions)
		.where(eq(taskQuestions.id, input.questionId))
		.limit(1);
	if (!question || question.taskId !== input.taskId) {
		throw errors.notFound("This question was not found.");
	}
	const place = await enrolled(database, question.userId, question.taskId);
	if (!place) throw errors.notFound("This question was not found.");
	await answerAllowed(database, input.userId, question.taskId, place);
	return database.transaction(async (tx) => {
		const [row] = await tx
			.insert(taskAnswers)
			.values({ questionId: question.id, userId: input.userId, body })
			.returning({ id: taskAnswers.id });
		if (!row) throw errors.internal();
		await writeAudit(tx, {
			actorId: input.userId,
			action: "task_answer.store",
			targetType: "task_question",
			targetId: question.id,
			ipAddress: input.ip,
			metadata: { answerId: row.id },
		});
		return { id: row.id };
	});
}

export async function decideAnswer(
	database: PeerDb,
	input: {
		userId: number;
		taskId: string;
		answerId: string;
		shown: boolean;
		ip: string;
	},
): Promise<{ status: AnswerStatus }> {
	const [answer] = await database
		.select({
			id: taskAnswers.id,
			userId: taskAnswers.userId,
			questionId: taskAnswers.questionId,
			taskId: taskQuestions.taskId,
			askerId: taskQuestions.userId,
		})
		.from(taskAnswers)
		.innerJoin(taskQuestions, eq(taskQuestions.id, taskAnswers.questionId))
		.where(eq(taskAnswers.id, input.answerId))
		.limit(1);
	if (!answer || answer.taskId !== input.taskId) {
		throw errors.notFound("This answer was not found.");
	}
	if (answer.userId === input.userId) {
		throw errors.forbidden(
			"Someone else decides whether this answer is shown.",
			{ reason: "question" },
		);
	}
	const place = await enrolled(database, answer.askerId, answer.taskId);
	if (!place) throw errors.notFound("This answer was not found.");
	const centers = await reviewCenters(database, input.userId);
	if (!covers(centers, place.centerId)) {
		throw errors.forbidden("A trainer decides whether this answer is shown.", {
			reason: "question",
		});
	}
	await database.transaction(async (tx) => {
		await tx.insert(taskAnswerDecisions).values({
			answerId: answer.id,
			moderatorUserId: input.userId,
			shown: input.shown,
		});
		await writeAudit(tx, {
			actorId: input.userId,
			action: input.shown ? "task_answer.show" : "task_answer.hide",
			targetType: "task_answer",
			targetId: answer.id,
			ipAddress: input.ip,
			metadata: { shown: input.shown },
		});
	});
	return { status: input.shown ? "shown" : "hidden" };
}

export async function readQuestionQueue(
	database: PeerDb,
	userId: number,
): Promise<{ waiting: QuestionQueueRow[] }> {
	const centers = await reviewCenters(database, userId);
	if (centers !== null && centers.length === 0) {
		throw errors.forbidden("A trainer reads the waiting answers.", {
			reason: "question",
		});
	}
	const questions = await database
		.select({
			id: taskQuestions.id,
			userId: taskQuestions.userId,
			body: taskQuestions.body,
			taskId: taskQuestions.taskId,
		})
		.from(taskQuestions)
		.orderBy(asc(taskQuestions.createdAt));
	const answers = await database
		.select({
			id: taskAnswers.id,
			questionId: taskAnswers.questionId,
			userId: taskAnswers.userId,
			body: taskAnswers.body,
		})
		.from(taskAnswers)
		.orderBy(asc(taskAnswers.createdAt));
	const decided = new Set(
		(
			await database
				.select({ answerId: taskAnswerDecisions.answerId })
				.from(taskAnswerDecisions)
		).map((row) => row.answerId),
	);
	const waiting: QuestionQueueRow[] = [];
	for (const question of questions) {
		const place = await enrolled(database, question.userId, question.taskId);
		if (!place || !covers(centers, place.centerId)) continue;
		const open = answers.filter((answer) => answer.questionId === question.id);
		if (open.length === 0) {
			const names = await namesOf(database, [question.userId]);
			waiting.push({
				taskId: question.taskId,
				questionId: question.id,
				answerId: null,
				questionBody: question.body,
				answerBody: "",
				authorName: names.get(question.userId) ?? "",
			});
			continue;
		}
		for (const answer of open) {
			if (decided.has(answer.id) || answer.userId === userId) continue;
			const names = await namesOf(database, [answer.userId]);
			waiting.push({
				taskId: question.taskId,
				questionId: question.id,
				answerId: answer.id,
				questionBody: question.body,
				answerBody: answer.body,
				authorName: names.get(answer.userId) ?? "",
			});
		}
	}
	return { waiting };
}

async function latestRule(
	database: Pick<Database, "select">,
	taskId: string,
): Promise<{ ruleEn: string; ruleRw: string } | null> {
	const [row] = await database
		.select({ ruleEn: taskGroupRules.ruleEn, ruleRw: taskGroupRules.ruleRw })
		.from(taskGroupRules)
		.where(eq(taskGroupRules.taskId, taskId))
		.orderBy(desc(taskGroupRules.createdAt))
		.limit(1);
	return row ?? null;
}

export async function createGroupRule(
	database: PeerDb,
	input: {
		actorId: number;
		taskId: string;
		ruleEn: string;
		ruleRw: string;
		ip: string;
	},
): Promise<{ ruleEn: string; ruleRw: string }> {
	if (!(await canWrite(database, input.actorId))) {
		throw errors.forbidden("An author writes the credit rule.", {
			reason: "group",
		});
	}
	await taskExists(database, input.taskId);
	const rule = {
		ruleEn: line(input.ruleEn, 200, "Write the English rule.", "group"),
		ruleRw: line(input.ruleRw, 200, "Write the Kinyarwanda rule.", "group"),
	};
	await database.transaction(async (tx) => {
		await tx.insert(taskGroupRules).values({
			...rule,
			taskId: input.taskId,
			createdByUserId: input.actorId,
		});
		await writeAudit(tx, {
			actorId: input.actorId,
			action: "task_group_rule.store",
			targetType: "task",
			targetId: input.taskId,
			ipAddress: input.ip,
		});
	});
	return rule;
}

function kindOf(value: string): "cooperative" | "family" {
	if (value === "cooperative" || value === "family") return value;
	throw errors.badRequest("Choose a cooperative or a family.", {
		reason: "group",
	});
}

async function classmatesOf(
	database: Pick<Database, "select">,
	courseId: string,
	centerId: string,
	except: number[],
): Promise<Classmate[]> {
	const rows = await database
		.select({ userId: enrollments.userId, name: users.name })
		.from(enrollments)
		.innerJoin(users, eq(users.id, enrollments.userId))
		.where(
			and(
				eq(enrollments.courseId, courseId),
				eq(enrollments.centerId, centerId),
			),
		);
	return rows
		.filter((row) => !except.includes(row.userId))
		.map((row) => ({ userId: row.userId, name: row.name?.trim() || "" }));
}

export async function readGroup(
	database: PeerDb,
	userId: number,
	taskId: string,
): Promise<{
	rule: { ruleEn: string; ruleRw: string } | null;
	groups: GroupView[];
	classmates: Classmate[];
	canWrite: boolean;
}> {
	await taskExists(database, taskId);
	const writer = await canWrite(database, userId);
	const place = await enrolled(database, userId, taskId);
	const centers = await reviewCenters(database, userId);
	const reviewer = place ? covers(centers, place.centerId) : false;
	if (!writer && !place && !reviewer) {
		throw errors.forbidden("Enroll in this course first.", { reason: "group" });
	}
	const rule = await latestRule(database, taskId);
	const groups = await database
		.select({
			id: taskGroups.id,
			kind: taskGroups.kind,
			name: taskGroups.name,
			createdByUserId: taskGroups.createdByUserId,
		})
		.from(taskGroups)
		.where(eq(taskGroups.taskId, taskId))
		.orderBy(asc(taskGroups.createdAt));
	const groupIds = groups.map((group) => group.id);
	const members =
		groupIds.length === 0
			? []
			: await database
					.select({
						groupId: taskGroupMembers.groupId,
						userId: taskGroupMembers.userId,
					})
					.from(taskGroupMembers)
					.where(inArray(taskGroupMembers.groupId, groupIds));
	const credits =
		groupIds.length === 0
			? []
			: await database
					.select({
						groupId: taskGroupCredits.groupId,
						userId: taskGroupCredits.userId,
						body: taskGroupCredits.body,
						createdAt: taskGroupCredits.createdAt,
					})
					.from(taskGroupCredits)
					.where(inArray(taskGroupCredits.groupId, groupIds))
					.orderBy(desc(taskGroupCredits.createdAt));
	const visible = groups.filter((group) => {
		if (reviewer || writer) return true;
		return members.some(
			(member) => member.groupId === group.id && member.userId === userId,
		);
	});
	const memberIds = members.map((member) => member.userId);
	const nameMap = await namesOf(database, [...new Set(memberIds)]);
	const mine = visible.find((group) => group.createdByUserId === userId);
	const classmates =
		place && mine
			? await classmatesOf(
					database,
					place.courseId,
					place.centerId,
					members
						.filter((member) => member.groupId === mine.id)
						.map((member) => member.userId),
				)
			: [];
	return {
		rule,
		canWrite: writer,
		classmates,
		groups: visible.map((group) => ({
			id: group.id,
			kind: kindOf(group.kind),
			name: group.name,
			createdByMe: group.createdByUserId === userId,
			members: members
				.filter((member) => member.groupId === group.id)
				.map((member) => ({
					userId: member.userId,
					name: nameMap.get(member.userId) ?? "",
					did:
						credits.find(
							(credit) =>
								credit.groupId === group.id && credit.userId === member.userId,
						)?.body ?? "",
					mine: member.userId === userId,
				})),
		})),
	};
}

export async function createGroup(
	database: PeerDb,
	input: {
		userId: number;
		taskId: string;
		kind: string;
		name: string;
		ip: string;
	},
): Promise<{ id: string }> {
	await taskExists(database, input.taskId);
	const place = await enrolled(database, input.userId, input.taskId);
	if (!place) {
		throw errors.forbidden("Enroll in this course first.", { reason: "group" });
	}
	if (!(await latestRule(database, input.taskId))) {
		throw errors.badRequest("This task is not group work.", {
			reason: "group",
		});
	}
	const kind = kindOf(input.kind);
	const name = line(input.name, 80, "Write the group name.", "group");
	try {
		return await database.transaction(async (tx) => {
			const [group] = await tx
				.insert(taskGroups)
				.values({
					taskId: input.taskId,
					kind,
					name,
					createdByUserId: input.userId,
				})
				.returning({ id: taskGroups.id });
			if (!group) throw errors.internal();
			await tx.insert(taskGroupMembers).values({
				groupId: group.id,
				userId: input.userId,
			});
			await writeAudit(tx, {
				actorId: input.userId,
				action: "task_group.store",
				targetType: "task",
				targetId: input.taskId,
				ipAddress: input.ip,
				metadata: { groupId: group.id, kind },
			});
			return { id: group.id };
		});
	} catch (error) {
		if (isUnique(error)) {
			throw errors.conflict("This group is already stored.", {
				reason: "group",
			});
		}
		throw error;
	}
}

function isUnique(error: unknown): boolean {
	let current: unknown = error;
	for (let depth = 0; depth < 5 && current; depth += 1) {
		if (
			typeof current === "object" &&
			current !== null &&
			"code" in current &&
			current.code === "23505"
		) {
			return true;
		}
		current =
			typeof current === "object" && current !== null && "cause" in current
				? current.cause
				: null;
	}
	return false;
}

async function sameCourse(
	database: Pick<Database, "select">,
	userId: number,
	place: Place,
	taskId: string,
): Promise<boolean> {
	const other = await enrolled(database, userId, taskId);
	return (
		other !== null &&
		other.courseId === place.courseId &&
		other.centerId === place.centerId
	);
}

export async function addGroupMember(
	database: PeerDb,
	input: {
		actorId: number;
		taskId: string;
		groupId: string;
		userId: number;
		ip: string;
	},
): Promise<{ userId: number }> {
	const [group] = await database
		.select({
			id: taskGroups.id,
			taskId: taskGroups.taskId,
			createdByUserId: taskGroups.createdByUserId,
		})
		.from(taskGroups)
		.where(eq(taskGroups.id, input.groupId))
		.limit(1);
	if (!group || group.taskId !== input.taskId) {
		throw errors.notFound("This group was not found.");
	}
	const place = await enrolled(database, group.createdByUserId, group.taskId);
	if (!place) throw errors.notFound("This group was not found.");
	const centers = await reviewCenters(database, input.actorId);
	const allowed =
		input.actorId === group.createdByUserId || covers(centers, place.centerId);
	if (!allowed) {
		throw errors.forbidden("The person who started the group adds people.", {
			reason: "group",
		});
	}
	if (!(await sameCourse(database, input.userId, place, group.taskId))) {
		throw errors.badRequest("Choose someone enrolled in this course.", {
			reason: "group",
		});
	}
	try {
		await database.insert(taskGroupMembers).values({
			groupId: group.id,
			userId: input.userId,
		});
	} catch (error) {
		if (isUnique(error)) {
			throw errors.conflict("This person is already in the group.", {
				reason: "group",
			});
		}
		throw error;
	}
	await writeAudit(database, {
		actorId: input.actorId,
		action: "task_group.member",
		targetType: "task_group",
		targetId: group.id,
		ipAddress: input.ip,
		metadata: { userId: input.userId },
	});
	return { userId: input.userId };
}

export async function recordCredit(
	database: PeerDb,
	input: {
		userId: number;
		taskId: string;
		groupId: string;
		body: string;
		ip: string;
	},
): Promise<{ body: string }> {
	const body = line(input.body, 200, "Write what you did.", "group");
	const [member] = await database
		.select({ userId: taskGroupMembers.userId, taskId: taskGroups.taskId })
		.from(taskGroupMembers)
		.innerJoin(taskGroups, eq(taskGroups.id, taskGroupMembers.groupId))
		.where(
			and(
				eq(taskGroupMembers.groupId, input.groupId),
				eq(taskGroupMembers.userId, input.userId),
			),
		)
		.limit(1);
	if (!member || member.taskId !== input.taskId) {
		throw errors.forbidden("Join the group before you record what you did.", {
			reason: "group",
		});
	}
	await database.transaction(async (tx) => {
		await tx.insert(taskGroupCredits).values({
			groupId: input.groupId,
			userId: input.userId,
			body,
		});
		await writeAudit(tx, {
			actorId: input.userId,
			action: "task_group.credit",
			targetType: "task_group",
			targetId: input.groupId,
			ipAddress: input.ip,
		});
	});
	return { body };
}

/** Used by the test to confirm a rehearsal stores no attempt. */
export async function submissionCount(
	database: Pick<Database, "select">,
	userId: number,
): Promise<number> {
	const [row] = await database
		.select({ count: sql<number>`count(*)::int` })
		.from(taskSubmissions)
		.where(eq(taskSubmissions.ownerUserId, userId));
	return Number(row?.count ?? 0);
}
