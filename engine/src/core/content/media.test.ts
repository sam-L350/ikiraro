import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../db/schema";
import { contentVersions } from "../../db/schema";
import type { JsonValue } from "../../db/schema/compliance";
import { createUserWithPassport } from "../identity/create-user";
import {
	createCourse,
	createCriterion,
	createModule,
	createTask,
	openNextDraft,
	saveBadge,
	submitCourseForReview,
	updateCriterion,
	updateTask,
} from "./author";
import { approveCourse, publishCourse } from "./review";

function isUsable(url: string): boolean {
	try {
		return new URL(url).hostname !== "db";
	} catch {
		return false;
	}
}

function databaseUrl(): string | null {
	const fromEnv = process.env.DATABASE_URL;
	if (fromEnv && isUsable(fromEnv)) return fromEnv;
	try {
		const path = resolve(
			dirname(fileURLToPath(import.meta.url)),
			"../../../.env.local",
		);
		const text = readFileSync(path, "utf8");
		for (const line of text.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed.startsWith("DATABASE_URL=")) continue;
			const value = trimmed
				.slice("DATABASE_URL=".length)
				.trim()
				.replace(/^['"]|['"]$/g, "");
			if (isUsable(value)) return value;
		}
	} catch {
		return null;
	}
	return null;
}

function openDatabase() {
	const url = databaseUrl();
	if (!url) return null;
	const client = postgres(url, { max: 1, connect_timeout: 15 });
	return { client, db: drizzle({ client, schema }) };
}

const suite = openDatabase();

afterAll(async () => {
	await suite?.client.end({ timeout: 5 });
});

type Pinned = {
	passThreshold: number;
	imageKey: string;
	outboundUrl: string;
	criterionPass: number;
	minimumHours: number | null;
};

function readPinned(snapshot: JsonValue): Pinned {
	if (
		typeof snapshot !== "object" ||
		snapshot === null ||
		Array.isArray(snapshot)
	) {
		throw new Error("snapshot was not an object");
	}
	const modules = snapshot.modules;
	if (!Array.isArray(modules)) throw new Error("snapshot has no modules");
	const module = modules[0];
	if (typeof module !== "object" || module === null || Array.isArray(module)) {
		throw new Error("snapshot module was not an object");
	}
	const moduleTasks = module.tasks;
	if (!Array.isArray(moduleTasks)) throw new Error("snapshot has no tasks");
	const task = moduleTasks[0];
	if (typeof task !== "object" || task === null || Array.isArray(task)) {
		throw new Error("snapshot task was not an object");
	}
	const criteria = task.criteria;
	if (!Array.isArray(criteria)) throw new Error("snapshot has no criteria");
	const criterion = criteria[0];
	if (
		typeof criterion !== "object" ||
		criterion === null ||
		Array.isArray(criterion)
	) {
		throw new Error("snapshot criterion was not an object");
	}
	const badge = snapshot.badge;
	if (typeof badge !== "object" || badge === null || Array.isArray(badge)) {
		throw new Error("snapshot badge was not an object");
	}
	const rule = badge.rule;
	if (typeof rule !== "object" || rule === null || Array.isArray(rule)) {
		throw new Error("snapshot rule was not an object");
	}
	if (
		typeof task.passThreshold !== "number" ||
		typeof task.imageKey !== "string" ||
		typeof task.outboundUrl !== "string" ||
		typeof criterion.passThreshold !== "number"
	) {
		throw new Error("snapshot task fields were missing");
	}
	const minimumHours = rule.minimumHours;
	if (typeof minimumHours !== "number" && minimumHours !== null) {
		throw new Error("snapshot hours were missing");
	}
	return {
		passThreshold: task.passThreshold,
		imageKey: task.imageKey,
		outboundUrl: task.outboundUrl,
		criterionPass: criterion.passThreshold,
		minimumHours,
	};
}

async function pinned(
	database: NonNullable<typeof suite>["db"],
	courseId: string,
	versionNumber: number,
): Promise<Pinned> {
	const [row] = await database
		.select({ snapshot: contentVersions.snapshot })
		.from(contentVersions)
		.where(
			and(
				eq(contentVersions.courseId, courseId),
				eq(contentVersions.versionNumber, versionNumber),
			),
		)
		.limit(1);
	if (!row) throw new Error(`version ${versionNumber} was not stored`);
	return readPinned(row.snapshot);
}

describe.serial("published rubric and badge", () => {
	test.skipIf(suite === null)(
		"a later draft can change the rubric, the badge, and the media keys without changing the pinned version",
		async () => {
			if (!suite) return;
			const database = suite.db;
			const author = await createUserWithPassport(database, {
				email: `author-${crypto.randomUUID()}@example.com`,
				name: "Author",
			});
			const reviewer = await createUserWithPassport(database, {
				email: `reviewer-${crypto.randomUUID()}@example.com`,
				name: "Reviewer",
			});
			const actor = { actorId: author.userId, ip: "test" };
			const reviewerActor = { actorId: reviewer.userId, ip: "test" };
			const draft = await createCourse(database, {
				...actor,
				titleEn: "Practice on Irembo",
			});
			const withModule = await createModule(database, {
				...actor,
				courseId: draft.id,
				titleEn: "The service",
			});
			const moduleId = withModule.modules[0]?.id;
			if (!moduleId) throw new Error("module was not stored");
			const withTask = await createTask(database, {
				...actor,
				moduleId,
				titleEn: "Open the service",
			});
			const task = withTask.modules[0]?.tasks[0];
			if (!task) throw new Error("task was not stored");
			await updateTask(database, {
				...actor,
				taskId: task.id,
				titleEn: "Open the service",
				evidenceType: "photo",
				passThreshold: 70,
				required: true,
				imageKey: "courses/irembo/page.png",
				audioKey: "courses/irembo/page.mp3",
				jobAidKey: "courses/irembo/page.pdf",
				outboundUrl: "https://irembo.gov.rw/",
			});
			const withCriterion = await createCriterion(database, {
				...actor,
				taskId: task.id,
				weight: 2,
				passThreshold: 60,
				promptEn: "The page is the right service.",
			});
			const criterionId = withCriterion.modules[0]?.tasks[0]?.criteria[0]?.id;
			if (!criterionId) throw new Error("criterion was not stored");
			await saveBadge(database, {
				...actor,
				courseId: draft.id,
				titleEn: "Irembo practice",
				titleRw: "Imyitozo ya Irembo",
				level: 1,
				allRequiredTasksApproved: true,
				minimumScore: 70,
				minimumHours: 3,
			});
			await submitCourseForReview(database, { ...actor, courseId: draft.id });
			await approveCourse(database, { ...reviewerActor, courseId: draft.id });
			await publishCourse(database, { ...reviewerActor, courseId: draft.id });

			const first = await pinned(database, draft.id, 1);
			expect(first).toEqual({
				passThreshold: 70,
				imageKey: "courses/irembo/page.png",
				outboundUrl: "https://irembo.gov.rw/",
				criterionPass: 60,
				minimumHours: 3,
			});

			await openNextDraft(database, { ...actor, courseId: draft.id });
			await updateTask(database, {
				...actor,
				taskId: task.id,
				titleEn: "Open the service",
				evidenceType: "photo",
				passThreshold: 80,
				imageKey: "courses/irembo/next.png",
				outboundUrl: "https://irembo.gov.rw/next",
			});
			await updateCriterion(database, {
				...actor,
				criterionId,
				weight: 2,
				passThreshold: 90,
				promptEn: "The page is the right service.",
			});
			await saveBadge(database, {
				...actor,
				courseId: draft.id,
				titleEn: "Irembo practice",
				level: 1,
				allRequiredTasksApproved: true,
				minimumScore: 80,
				minimumHours: 9,
			});
			expect(await pinned(database, draft.id, 1)).toEqual(first);

			await submitCourseForReview(database, { ...actor, courseId: draft.id });
			await approveCourse(database, { ...reviewerActor, courseId: draft.id });
			await publishCourse(database, { ...reviewerActor, courseId: draft.id });
			expect(await pinned(database, draft.id, 2)).toEqual({
				passThreshold: 80,
				imageKey: "courses/irembo/next.png",
				outboundUrl: "https://irembo.gov.rw/next",
				criterionPass: 90,
				minimumHours: 9,
			});
			expect(await pinned(database, draft.id, 1)).toEqual(first);
		},
		120_000,
	);
});
