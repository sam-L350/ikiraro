import { desc, eq } from "drizzle-orm";
import type { Database } from "../../db";
import {
	consents,
	districts,
	learningCenters,
	mediaObjects,
	sectors,
	successStories,
	users,
} from "../../db/schema";
import { errors, isApiError } from "../api/error";
import { writeAudit } from "../audit/write";
import type { Assignment } from "../authz/decide";
import { readableDistricts } from "../hardware/equity";
import { isUnder18 } from "../identity/age";
import { currentConsents } from "../identity/consent";
import { EVIDENCE_URL_SECONDS } from "../storage/limits";
import type { ObjectStore } from "../storage/object-store";

/** A short story. The number is a length bound, not a suggested length. */
const STORY_LIMIT = 800;

type StoryDb = Pick<Database, "insert" | "select" | "transaction">;

export type OwnStory = {
	allowed: boolean;
	minor: boolean;
	body: string | null;
	photoUrl: string | null;
};

export type PartnerStory = {
	name: string;
	story: string;
	photoUrl: string;
};

function cleanStory(value: string): string {
	const trimmed = value.trim();
	if (!trimmed || trimmed.length > STORY_LIMIT) {
		throw errors.badRequest("Write the story.", { reason: "story" });
	}
	return trimmed;
}

async function personOf(database: Pick<Database, "select">, userId: number) {
	const [person] = await database
		.select({
			id: users.id,
			name: users.name,
			dateOfBirth: users.dateOfBirth,
			deletedAt: users.deletedAt,
		})
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	if (!person || person.deletedAt) {
		throw errors.notFound("That person was not found.");
	}
	return person;
}

function minorOf(dateOfBirth: string | null): boolean {
	return dateOfBirth ? isUnder18(dateOfBirth) : false;
}

async function allowed(
	database: Pick<Database, "select">,
	userId: number,
): Promise<boolean> {
	const rows = await currentConsents(database, userId);
	return rows.some((row) => row.purpose === "success_story" && row.granted);
}

/** The signed-in person's story, and whether partners may use it. */
export async function readOwnStory(
	database: StoryDb,
	store: Pick<ObjectStore, "createDownloadUrl">,
	userId: number,
): Promise<OwnStory> {
	const person = await personOf(database, userId);
	const minor = minorOf(person.dateOfBirth);
	const [story] = await database
		.select({
			body: successStories.body,
			objectKey: mediaObjects.objectKey,
			status: mediaObjects.status,
		})
		.from(successStories)
		.innerJoin(mediaObjects, eq(mediaObjects.id, successStories.mediaId))
		.where(eq(successStories.userId, userId))
		.orderBy(desc(successStories.createdAt))
		.limit(1);
	let photoUrl: string | null = null;
	if (story?.status === "ready") {
		const download = await store.createDownloadUrl({
			key: story.objectKey,
			expiresInSeconds: EVIDENCE_URL_SECONDS,
		});
		photoUrl = download.url;
	}
	return {
		allowed: !minor && (await allowed(database, userId)),
		minor,
		body: story?.body ?? null,
		photoUrl,
	};
}

/** Store a new story. Partners see it only while success-story consent is on. */
export async function publishStory(
	database: StoryDb,
	input: { userId: number; body: string; mediaId: string; ip: string },
): Promise<{ id: string }> {
	const person = await personOf(database, input.userId);
	if (minorOf(person.dateOfBirth)) {
		throw errors.badRequest(
			"Public passport, mentor contact, and a partner story stay off until the learner is 18.",
			{ reason: "minor_visibility" },
		);
	}
	if (!(await allowed(database, input.userId))) {
		throw errors.badRequest(
			"Allow partners to use a story before you add one.",
			{ reason: "consent" },
		);
	}
	const body = cleanStory(input.body);
	const mediaId = input.mediaId.trim();
	if (!mediaId) {
		throw errors.badRequest("Choose a photo.", { reason: "photo" });
	}
	const [media] = await database
		.select({
			ownerUserId: mediaObjects.ownerUserId,
			contentType: mediaObjects.contentType,
			status: mediaObjects.status,
		})
		.from(mediaObjects)
		.where(eq(mediaObjects.id, mediaId))
		.limit(1);
	if (!media || media.ownerUserId !== input.userId) {
		throw errors.forbidden("That file is not yours.", { reason: "scope" });
	}
	if (media.status !== "ready") {
		throw errors.conflict("The photo is not ready.", { reason: "photo" });
	}
	if (!media.contentType.startsWith("image/")) {
		throw errors.badRequest("Choose a photo.", { reason: "photo" });
	}
	const [created] = await database
		.insert(successStories)
		.values({ userId: input.userId, body, mediaId })
		.returning({ id: successStories.id });
	if (!created) throw errors.internal("The story could not be stored.");
	await writeAudit(database, {
		actorId: input.userId,
		action: "success_story.published",
		targetType: "success_story",
		targetId: created.id,
		ipAddress: input.ip,
		metadata: {},
	});
	return { id: created.id };
}

async function partnerRows(
	database: Database,
	store: Pick<ObjectStore, "createDownloadUrl">,
	assignments: readonly Assignment[],
): Promise<PartnerStory[]> {
	let districtIds: string[] | null;
	try {
		districtIds = await readableDistricts(database, assignments);
	} catch (error) {
		if (isApiError(error) && error.status === 403) {
			throw errors.forbidden(
				"A coordinator or an auditor reads these stories.",
				{ reason: "scope" },
			);
		}
		throw error;
	}
	const stories = await database
		.select({
			userId: successStories.userId,
			body: successStories.body,
			name: users.name,
			dateOfBirth: users.dateOfBirth,
			districtId: districts.id,
			objectKey: mediaObjects.objectKey,
			status: mediaObjects.status,
		})
		.from(successStories)
		.innerJoin(users, eq(users.id, successStories.userId))
		.innerJoin(mediaObjects, eq(mediaObjects.id, successStories.mediaId))
		.leftJoin(learningCenters, eq(learningCenters.id, users.centerId))
		.leftJoin(sectors, eq(sectors.id, learningCenters.sectorId))
		.leftJoin(districts, eq(districts.id, sectors.districtId))
		.orderBy(desc(successStories.createdAt));
	const consentRows = await database
		.select({
			userId: consents.userId,
			granted: consents.granted,
		})
		.from(consents)
		.where(eq(consents.purpose, "success_story"))
		.orderBy(desc(consents.grantedAt));
	const consent = new Map<number, boolean>();
	for (const row of consentRows) {
		if (!consent.has(row.userId)) consent.set(row.userId, row.granted);
	}
	const latest = new Map<number, (typeof stories)[number]>();
	for (const row of stories) {
		if (!latest.has(row.userId)) latest.set(row.userId, row);
	}
	const result: PartnerStory[] = [];
	for (const row of latest.values()) {
		if (consent.get(row.userId) !== true) continue;
		if (minorOf(row.dateOfBirth)) continue;
		if (row.status !== "ready") continue;
		if (districtIds !== null) {
			if (!row.districtId || !districtIds.includes(row.districtId)) continue;
		}
		const download = await store.createDownloadUrl({
			key: row.objectKey,
			expiresInSeconds: EVIDENCE_URL_SECONDS,
		});
		const name = row.name?.trim() ?? "";
		result.push({ name, story: row.body, photoUrl: download.url });
	}
	result.sort((left, right) => left.name.localeCompare(right.name));
	return result;
}

/** Consented stories a partner report can include. Phone, email, and village stay out. */
export async function readPartnerStories(
	database: Database,
	store: Pick<ObjectStore, "createDownloadUrl">,
	assignments: readonly Assignment[],
): Promise<{ stories: PartnerStory[] }> {
	return { stories: await partnerRows(database, store, assignments) };
}

/** The same stories as a file a partner report can attach. */
export async function exportPartnerStories(
	database: Database,
	store: Pick<ObjectStore, "createDownloadUrl">,
	input: { actorId: number; assignments: readonly Assignment[]; ip: string },
): Promise<{ file: string }> {
	const stories = await partnerRows(database, store, input.assignments);
	await writeAudit(database, {
		actorId: input.actorId,
		action: "success_story.exported",
		targetType: "success_story",
		ipAddress: input.ip,
		metadata: { count: stories.length },
	});
	return {
		file: JSON.stringify(
			stories.map((story) => ({
				name: story.name,
				story: story.story,
				photoUrl: story.photoUrl,
			})),
		),
	};
}
