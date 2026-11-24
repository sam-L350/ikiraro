import { and, desc, eq, ilike, isNull, or } from "drizzle-orm";
import type { Database } from "../../db";
import { helpGuides, mediaObjects, roles, userRoles } from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit } from "../audit/write";

type GuideDb = Pick<Database, "insert" | "select">;

export type HelpGuideView = {
	id: string;
	titleEn: string;
	titleRw: string;
	bodyEn: string;
	bodyRw: string;
	walkthrough: "audio" | "video" | null;
};

const TITLE_LIMIT = 200;
const BODY_LIMIT = 4_000;

function clean(
	value: string,
	limit: number,
	empty: string,
	reason: string,
): string {
	const trimmed = value.trim();
	if (!trimmed || trimmed.length > limit) {
		throw errors.badRequest(empty, { reason });
	}
	return trimmed;
}

async function canWrite(
	database: Pick<Database, "select">,
	userId: number,
): Promise<boolean> {
	const rows = await database
		.select({ code: roles.code, scopeType: userRoles.scopeType })
		.from(userRoles)
		.innerJoin(roles, eq(roles.id, userRoles.roleId))
		.where(and(eq(userRoles.userId, userId), isNull(userRoles.suspendedAt)));
	return rows.some(
		(row) => row.code === "platform_admin" && row.scopeType === "global",
	);
}

function like(value: string): string {
	return `%${value.trim().replace(/[\\%_]/g, "\\$&")}%`;
}

/** Published guides. A blank search returns the latest ones. */
export async function listHelpGuides(
	database: Pick<Database, "select">,
	input: { userId: number; q?: string },
): Promise<{ guides: HelpGuideView[]; canWrite: boolean }> {
	const query = input.q?.trim() ?? "";
	const pattern = query ? like(query) : null;
	const rows = await database
		.select({
			id: helpGuides.id,
			titleEn: helpGuides.titleEn,
			titleRw: helpGuides.titleRw,
			bodyEn: helpGuides.bodyEn,
			bodyRw: helpGuides.bodyRw,
			walkthrough: helpGuides.walkthrough,
		})
		.from(helpGuides)
		.where(
			pattern
				? or(
						ilike(helpGuides.titleEn, pattern),
						ilike(helpGuides.titleRw, pattern),
						ilike(helpGuides.bodyEn, pattern),
						ilike(helpGuides.bodyRw, pattern),
					)
				: undefined,
		)
		.orderBy(desc(helpGuides.createdAt))
		.limit(40);
	return {
		canWrite: await canWrite(database, input.userId),
		guides: rows.flatMap((row) => {
			const walkthrough =
				row.walkthrough === "audio" || row.walkthrough === "video"
					? row.walkthrough
					: null;
			return [{ ...row, walkthrough }];
		}),
	};
}

/** Store a guide. Audio or video has to be a ready file this admin owns. */
export async function publishHelpGuide(
	database: GuideDb,
	input: {
		actorId: number;
		titleEn: string;
		titleRw: string;
		bodyEn: string;
		bodyRw: string;
		walkthrough?: string;
		mediaId?: string;
		ip: string;
	},
): Promise<{ id: string }> {
	if (!(await canWrite(database, input.actorId))) {
		throw errors.forbidden("A platform admin publishes a guide.", {
			reason: "scope",
		});
	}
	const titleEn = clean(
		input.titleEn,
		TITLE_LIMIT,
		"Write the title.",
		"title",
	);
	const titleRw = clean(
		input.titleRw,
		TITLE_LIMIT,
		"Write the title.",
		"title",
	);
	const bodyEn = clean(input.bodyEn, BODY_LIMIT, "Write the guide.", "body");
	const bodyRw = clean(input.bodyRw, BODY_LIMIT, "Write the guide.", "body");
	const walkthrough = input.walkthrough?.trim() ?? "";
	const mediaId = input.mediaId?.trim() ?? "";
	if (
		walkthrough !== "" &&
		walkthrough !== "audio" &&
		walkthrough !== "video"
	) {
		throw errors.badRequest("Choose audio or video.", { reason: "media" });
	}
	if ((walkthrough === "") !== (mediaId === "")) {
		throw errors.badRequest("A walkthrough needs its audio or video.", {
			reason: "media",
		});
	}
	if (mediaId) {
		const [media] = await database
			.select({
				ownerUserId: mediaObjects.ownerUserId,
				contentType: mediaObjects.contentType,
				status: mediaObjects.status,
			})
			.from(mediaObjects)
			.where(eq(mediaObjects.id, mediaId))
			.limit(1);
		if (!media || media.ownerUserId !== input.actorId) {
			throw errors.forbidden("That file is not yours.", { reason: "scope" });
		}
		if (media.status !== "ready") {
			throw errors.conflict("The file is not ready.", { reason: "photo" });
		}
		const prefix = walkthrough === "audio" ? "audio/" : "video/";
		if (!media.contentType.startsWith(prefix)) {
			throw errors.badRequest("Choose audio or video.", { reason: "media" });
		}
	}
	const [created] = await database
		.insert(helpGuides)
		.values({
			titleEn,
			titleRw,
			bodyEn,
			bodyRw,
			walkthrough: walkthrough === "" ? null : walkthrough,
			mediaId: mediaId === "" ? null : mediaId,
			createdByUserId: input.actorId,
		})
		.returning({ id: helpGuides.id });
	if (!created) throw errors.internal("The guide could not be stored.");
	await writeAudit(database, {
		actorId: input.actorId,
		action: "help_guide.published",
		targetType: "help_guide",
		targetId: created.id,
		ipAddress: input.ip,
		metadata: { walkthrough: walkthrough === "" ? "text" : walkthrough },
	});
	return { id: created.id };
}
