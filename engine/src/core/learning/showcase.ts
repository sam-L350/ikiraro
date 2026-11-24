import { and, asc, eq, inArray } from "drizzle-orm";
import type { Database } from "../../db";
import {
	mediaObjects,
	showcasePins,
	taskSubmissions,
	taskTranslations,
} from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit } from "../audit/write";
import type { EvidenceType } from "../content/author";
import { EVIDENCE_URL_SECONDS } from "../storage/limits";
import type { ObjectStore } from "../storage/object-store";

type ShowcaseDb = Pick<Database, "insert" | "select">;

const PIN_LIMIT = 3;

export type ShowcaseItem = {
	submissionId: string;
	titleEn: string;
	titleRw: string;
	evidenceType: EvidenceType;
	evidenceUrl: string | null;
};

function isUuid(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
		value,
	);
}

function isEvidence(value: string): value is EvidenceType {
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

/**
 * The gallery shows the stored evidence. A photo was covered by the learner
 * before it was sent. The note text and the email stay off the card.
 */
export async function readShowcase(
	database: ShowcaseDb,
	store: ObjectStore,
	userId: number,
): Promise<{ pins: ShowcaseItem[]; open: ShowcaseItem[] }> {
	const rows = await database
		.select({
			submissionId: taskSubmissions.id,
			taskId: taskSubmissions.taskId,
			evidenceType: taskSubmissions.evidenceType,
			pinId: showcasePins.id,
			objectKey: mediaObjects.objectKey,
			mediaStatus: mediaObjects.status,
		})
		.from(taskSubmissions)
		.leftJoin(
			showcasePins,
			and(
				eq(showcasePins.submissionId, taskSubmissions.id),
				eq(showcasePins.userId, userId),
			),
		)
		.leftJoin(mediaObjects, eq(mediaObjects.id, taskSubmissions.mediaObjectId))
		.where(
			and(
				eq(taskSubmissions.ownerUserId, userId),
				eq(taskSubmissions.status, "approved"),
			),
		)
		.orderBy(asc(taskSubmissions.createdAt));
	const taskIds = [...new Set(rows.map((row) => row.taskId))];
	const titles = new Map<string, { titleEn: string; titleRw: string }>();
	if (taskIds.length > 0) {
		const copy = await database
			.select({
				taskId: taskTranslations.taskId,
				locale: taskTranslations.locale,
				title: taskTranslations.title,
			})
			.from(taskTranslations)
			.where(inArray(taskTranslations.taskId, taskIds));
		for (const row of copy) {
			const current = titles.get(row.taskId) ?? { titleEn: "", titleRw: "" };
			if (row.locale === "en") current.titleEn = row.title;
			if (row.locale === "rw") current.titleRw = row.title;
			titles.set(row.taskId, current);
		}
	}
	const pins: ShowcaseItem[] = [];
	const open: ShowcaseItem[] = [];
	for (const row of rows) {
		if (!isEvidence(row.evidenceType)) continue;
		const title = titles.get(row.taskId) ?? { titleEn: "", titleRw: "" };
		let evidenceUrl: string | null = null;
		if (
			row.evidenceType !== "note" &&
			row.mediaStatus === "ready" &&
			row.objectKey
		) {
			const signed = await store.createDownloadUrl({
				key: row.objectKey,
				expiresInSeconds: EVIDENCE_URL_SECONDS,
			});
			evidenceUrl = signed.url;
		}
		const item = {
			submissionId: row.submissionId,
			titleEn: title.titleEn,
			titleRw: title.titleRw,
			evidenceType: row.evidenceType,
			evidenceUrl,
		};
		if (row.pinId) pins.push(item);
		else open.push(item);
	}
	return { pins, open };
}

/** Pin one approved piece of this learner's own work. Three is the most. */
export async function pinShowcase(
	database: ShowcaseDb,
	input: { userId: number; submissionId: string; ip: string },
): Promise<{ id: string }> {
	if (!isUuid(input.submissionId)) {
		throw errors.notFound("That work was not found.");
	}
	const [row] = await database
		.select({
			id: taskSubmissions.id,
			ownerUserId: taskSubmissions.ownerUserId,
			status: taskSubmissions.status,
		})
		.from(taskSubmissions)
		.where(eq(taskSubmissions.id, input.submissionId))
		.limit(1);
	if (!row || row.ownerUserId !== input.userId || row.status !== "approved") {
		throw errors.notFound("That work was not found.");
	}
	const held = await database
		.select({ id: showcasePins.id, submissionId: showcasePins.submissionId })
		.from(showcasePins)
		.where(eq(showcasePins.userId, input.userId));
	if (held.some((pin) => pin.submissionId === row.id)) {
		throw errors.conflict("This work is already on the showcase.", {
			reason: "showcase",
		});
	}
	if (held.length >= PIN_LIMIT) {
		throw errors.conflict("Three pieces are already on the showcase.", {
			reason: "showcase",
		});
	}
	const [created] = await database
		.insert(showcasePins)
		.values({ userId: input.userId, submissionId: row.id })
		.returning({ id: showcasePins.id });
	if (!created) throw errors.internal("The piece was not pinned.");
	await writeAudit(database, {
		actorId: input.userId,
		action: "showcase.pinned",
		targetType: "showcase_pin",
		targetId: created.id,
		ipAddress: input.ip,
		metadata: { submissionId: row.id },
	});
	return { id: created.id };
}
