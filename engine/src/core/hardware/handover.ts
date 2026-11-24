import { and, asc, desc, eq, isNull } from "drizzle-orm";
import type { Database } from "../../db";
import {
	centerStaff,
	handoverRecords,
	hardwareGrants,
	hardwareInventory,
	hardwareStatusHistory,
	type JsonValue,
	learningCenters,
	mediaObjects,
	users,
} from "../../db/schema";
import { errors } from "../api/error";
import { writeAudit } from "../audit/write";
import { consumeOtpChallenge, createOtp, readMatchingOtp } from "../auth/login";
import type { SmsSender } from "../sms/sender";
import type { InventoryStatus } from "./inventory";

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type HandoverDb = Pick<
	Database,
	"insert" | "select" | "transaction" | "update"
>;

export type HandoverGrant = {
	id: string;
	itemName: string;
	serial: string;
	recipientName: string;
	recorded: boolean;
};

export type HandoverPreview = {
	itemName: string;
	serial: string;
	category: string;
	donor: string | null;
	centerName: string;
	recipientName: string;
	awardedOn: string;
};

export type HandoverForm = HandoverPreview & { witnessName: string };

export type HandoverTrail = {
	id: string;
	status: InventoryStatus;
	centerName: string;
	holderName: string | null;
	recordedAt: string;
};

export type HandoverDetail = {
	id: string;
	recorded: boolean;
	preview: HandoverPreview;
	form: HandoverForm | null;
	acknowledgment: "signature" | "otp" | null;
	witnesses: { id: number; name: string }[];
	trail: HandoverTrail[];
};

type GrantRow = {
	id: string;
	status: string;
	inventoryId: string;
	recipientUserId: number;
	awardedOn: string;
	handoverConfirmedAt: Date | null;
	itemName: string;
	serial: string;
	category: string;
	donor: string | null;
	itemStatus: string;
	centerId: string;
	centerName: string;
	recipientName: string | null;
	recipientEmail: string;
	recipientPhone: string | null;
};

function isUuid(value: string): boolean {
	return UUID_RE.test(value);
}

function personName(name: string | null, email: string): string {
	const trimmed = name?.trim();
	return trimmed ? trimmed : email;
}

function isUniqueViolation(error: unknown): boolean {
	if (typeof error !== "object" || error === null) return false;
	if ("code" in error && error.code === "23505") return true;
	if ("cause" in error) return isUniqueViolation(error.cause);
	return false;
}

function asStatus(value: string): InventoryStatus {
	switch (value) {
		case "in_stock":
		case "reserved":
		case "awarded":
		case "in_repair":
		case "lost":
		case "retired":
			return value;
		default:
			return "awarded";
	}
}

function isForm(value: unknown): value is HandoverForm {
	if (typeof value !== "object" || value === null) return false;
	const row = value as Record<string, unknown>;
	return (
		typeof row.itemName === "string" &&
		typeof row.serial === "string" &&
		typeof row.category === "string" &&
		(row.donor === null || typeof row.donor === "string") &&
		typeof row.centerName === "string" &&
		typeof row.recipientName === "string" &&
		typeof row.witnessName === "string" &&
		typeof row.awardedOn === "string"
	);
}

async function loadGrant(
	database: HandoverDb,
	grantId: string,
): Promise<GrantRow> {
	if (!isUuid(grantId)) throw errors.notFound("That grant was not found.");
	const [row] = await database
		.select({
			id: hardwareGrants.id,
			status: hardwareGrants.status,
			inventoryId: hardwareGrants.inventoryId,
			recipientUserId: hardwareGrants.recipientUserId,
			awardedOn: hardwareGrants.awardedOn,
			handoverConfirmedAt: hardwareGrants.handoverConfirmedAt,
			itemName: hardwareInventory.name,
			serial: hardwareInventory.serial,
			category: hardwareInventory.category,
			donor: hardwareInventory.donor,
			itemStatus: hardwareInventory.status,
			centerId: hardwareInventory.centerId,
			centerName: learningCenters.name,
			recipientName: users.name,
			recipientEmail: users.email,
			recipientPhone: users.phone,
		})
		.from(hardwareGrants)
		.innerJoin(
			hardwareInventory,
			eq(hardwareInventory.id, hardwareGrants.inventoryId),
		)
		.innerJoin(
			learningCenters,
			eq(learningCenters.id, hardwareInventory.centerId),
		)
		.innerJoin(users, eq(users.id, hardwareGrants.recipientUserId))
		.where(eq(hardwareGrants.id, grantId))
		.limit(1);
	if (!row) throw errors.notFound("That grant was not found.");
	return row;
}

function previewOf(grant: GrantRow): HandoverPreview {
	return {
		itemName: grant.itemName,
		serial: grant.serial,
		category: grant.category,
		donor: grant.donor,
		centerName: grant.centerName,
		recipientName: personName(grant.recipientName, grant.recipientEmail),
		awardedOn: grant.awardedOn,
	};
}

async function readyImage(
	database: HandoverDb,
	mediaId: string,
	ownerId: number,
	reason: "photo" | "signature",
): Promise<void> {
	if (!isUuid(mediaId)) {
		throw errors.badRequest(
			"The photo has to be an image that finished uploading.",
			{
				reason,
			},
		);
	}
	const [row] = await database
		.select({
			ownerUserId: mediaObjects.ownerUserId,
			contentType: mediaObjects.contentType,
			status: mediaObjects.status,
		})
		.from(mediaObjects)
		.where(eq(mediaObjects.id, mediaId))
		.limit(1);
	if (!row || row.ownerUserId !== ownerId) {
		throw errors.notFound("That file was not found.");
	}
	if (!row.contentType.startsWith("image/")) {
		throw errors.badRequest(
			"The photo has to be an image that finished uploading.",
			{
				reason,
			},
		);
	}
	if (row.status !== "ready") {
		throw errors.conflict(
			"The photo has to be an image that finished uploading.",
			{
				reason,
			},
		);
	}
}

/** Active grants, with whether the handover form is already stored. */
export async function listHandovers(
	database: HandoverDb,
): Promise<HandoverGrant[]> {
	const rows = await database
		.select({
			id: hardwareGrants.id,
			itemName: hardwareInventory.name,
			serial: hardwareInventory.serial,
			recipientName: users.name,
			recipientEmail: users.email,
			handoverId: handoverRecords.id,
		})
		.from(hardwareGrants)
		.innerJoin(
			hardwareInventory,
			eq(hardwareInventory.id, hardwareGrants.inventoryId),
		)
		.innerJoin(users, eq(users.id, hardwareGrants.recipientUserId))
		.leftJoin(handoverRecords, eq(handoverRecords.grantId, hardwareGrants.id))
		.where(eq(hardwareGrants.status, "active"))
		.orderBy(desc(hardwareGrants.createdAt))
		.limit(100);
	return rows.map((row) => ({
		id: row.id,
		itemName: row.itemName,
		serial: row.serial,
		recipientName: personName(row.recipientName, row.recipientEmail),
		recorded: row.handoverId !== null,
	}));
}

/** The form, the people who can witness it, and the trail from the donor. */
export async function readHandover(
	database: HandoverDb,
	grantId: string,
	actorId: number,
): Promise<HandoverDetail> {
	const grant = await loadGrant(database, grantId);
	const [stored] = await database
		.select({
			acknowledgment: handoverRecords.acknowledgment,
			form: handoverRecords.form,
		})
		.from(handoverRecords)
		.where(eq(handoverRecords.grantId, grant.id))
		.limit(1);
	const staff = await database
		.select({ id: users.id, name: users.name, email: users.email })
		.from(centerStaff)
		.innerJoin(users, eq(users.id, centerStaff.userId))
		.where(
			and(eq(centerStaff.centerId, grant.centerId), isNull(users.deletedAt)),
		)
		.orderBy(asc(users.name))
		.limit(50);
	const trail = await database
		.select({
			id: hardwareStatusHistory.id,
			status: hardwareStatusHistory.status,
			centerName: learningCenters.name,
			holderName: users.name,
			recordedAt: hardwareStatusHistory.recordedAt,
		})
		.from(hardwareStatusHistory)
		.innerJoin(
			learningCenters,
			eq(learningCenters.id, hardwareStatusHistory.centerId),
		)
		.leftJoin(users, eq(users.id, hardwareStatusHistory.holderUserId))
		.where(eq(hardwareStatusHistory.inventoryId, grant.inventoryId))
		.orderBy(asc(hardwareStatusHistory.recordedAt))
		.limit(50);
	const acknowledgment =
		stored?.acknowledgment === "signature" || stored?.acknowledgment === "otp"
			? stored.acknowledgment
			: null;
	return {
		id: grant.id,
		recorded: stored !== undefined,
		preview: previewOf(grant),
		form: stored && isForm(stored.form) ? stored.form : null,
		acknowledgment,
		witnesses: staff
			.filter(
				(person) =>
					person.id !== grant.recipientUserId && person.id !== actorId,
			)
			.map((person) => ({
				id: person.id,
				name: personName(person.name, person.email),
			})),
		trail: trail.map((entry) => ({
			id: entry.id,
			status: asStatus(entry.status),
			centerName: entry.centerName,
			holderName: entry.holderName,
			recordedAt: entry.recordedAt.toISOString(),
		})),
	};
}

/** Text the recipient's phone. The code is not returned. */
export async function requestHandoverCode(
	database: HandoverDb,
	input: { actorId: number; grantId: string; ip: string },
	sender: SmsSender,
): Promise<{ sent: true }> {
	const grant = await loadGrant(database, input.grantId);
	if (input.actorId === grant.recipientUserId) {
		throw errors.forbidden(
			"The recipient does not record their own handover.",
			{
				reason: "self",
			},
		);
	}
	if (grant.handoverConfirmedAt) {
		throw errors.conflict("This handover is already stored.", {
			reason: "closed",
		});
	}
	if (!grant.recipientPhone) {
		throw errors.conflict("This recipient has no phone for a code.", {
			reason: "phone",
		});
	}
	return createOtp(
		database,
		{ phone: grant.recipientPhone, ip: input.ip },
		sender,
	);
}

/** Store the form, the acknowledgment, the photo, and the witness together. */
export async function recordHandover(
	database: HandoverDb,
	input: {
		actorId: number;
		grantId: string;
		witnessUserId: number;
		acknowledgment: string;
		signatureMediaId?: string;
		code?: string;
		photoMediaId: string;
		ip: string;
	},
): Promise<{ id: string }> {
	const grant = await loadGrant(database, input.grantId);
	if (input.actorId === grant.recipientUserId) {
		throw errors.forbidden(
			"The recipient does not record their own handover.",
			{
				reason: "self",
			},
		);
	}
	if (input.acknowledgment !== "signature" && input.acknowledgment !== "otp") {
		throw errors.badRequest("Choose a signature or a one-time code.", {
			reason: "acknowledgment",
		});
	}
	if (input.photoMediaId === input.signatureMediaId) {
		throw errors.badRequest(
			"The device photo and the signature are different images.",
			{
				reason: "photo",
			},
		);
	}
	await readyImage(database, input.photoMediaId, input.actorId, "photo");
	let challengeId: string | null = null;
	let signatureMediaId: string | null = null;
	if (input.acknowledgment === "signature") {
		if (!input.signatureMediaId) {
			throw errors.badRequest("Choose a signature or a one-time code.", {
				reason: "signature",
			});
		}
		signatureMediaId = input.signatureMediaId;
		await readyImage(database, signatureMediaId, input.actorId, "signature");
	} else {
		if (input.signatureMediaId) {
			throw errors.badRequest("Choose a signature or a one-time code.", {
				reason: "acknowledgment",
			});
		}
		if (!grant.recipientPhone || !input.code?.trim()) {
			throw errors.badRequest("Enter the code that was sent.", {
				reason: "otp",
			});
		}
		const matched = await readMatchingOtp(database, {
			phone: grant.recipientPhone,
			code: input.code,
		});
		if (matched.user.id !== grant.recipientUserId) {
			throw errors.forbidden("That code is not for this recipient.", {
				reason: "otp",
			});
		}
		challengeId = matched.challengeId;
	}
	const [witness] = await database
		.select({ id: users.id, name: users.name, email: users.email })
		.from(users)
		.where(and(eq(users.id, input.witnessUserId), isNull(users.deletedAt)))
		.limit(1);
	if (!witness) throw errors.notFound("That witness was not found.");
	if (witness.id === grant.recipientUserId || witness.id === input.actorId) {
		throw errors.forbidden("The witness is someone else at the center.", {
			reason: "witness",
		});
	}
	const [staff] = await database
		.select({ id: centerStaff.id })
		.from(centerStaff)
		.where(
			and(
				eq(centerStaff.centerId, grant.centerId),
				eq(centerStaff.userId, witness.id),
			),
		)
		.limit(1);
	if (!staff) {
		throw errors.forbidden("The witness is someone else at the center.", {
			reason: "witness",
		});
	}
	const form: HandoverForm = {
		...previewOf(grant),
		witnessName: personName(witness.name, witness.email),
	};
	try {
		return await database.transaction(async (tx) => {
			const [locked] = await tx
				.select({
					id: hardwareGrants.id,
					status: hardwareGrants.status,
					handoverConfirmedAt: hardwareGrants.handoverConfirmedAt,
				})
				.from(hardwareGrants)
				.where(eq(hardwareGrants.id, grant.id))
				.for("update")
				.limit(1);
			if (locked?.status !== "active" || locked?.handoverConfirmedAt) {
				throw errors.conflict("This handover is already stored.", {
					reason: "closed",
				});
			}
			if (grant.itemStatus !== "awarded") {
				throw errors.conflict("This item is not waiting to be handed over.", {
					reason: "stock",
				});
			}
			if (challengeId) await consumeOtpChallenge(tx, challengeId);
			const [row] = await tx
				.insert(handoverRecords)
				.values({
					grantId: grant.id,
					inventoryId: grant.inventoryId,
					recipientUserId: grant.recipientUserId,
					witnessUserId: witness.id,
					acknowledgment: input.acknowledgment,
					signatureMediaId,
					otpChallengeId: challengeId,
					photoMediaId: input.photoMediaId,
					form: form as JsonValue,
					recordedByUserId: input.actorId,
				})
				.returning({ id: handoverRecords.id });
			if (!row) throw errors.internal("The handover was not stored.");
			await tx
				.update(hardwareInventory)
				.set({ currentHolderUserId: grant.recipientUserId })
				.where(eq(hardwareInventory.id, grant.inventoryId));
			await tx
				.update(hardwareGrants)
				.set({ handoverConfirmedAt: new Date() })
				.where(eq(hardwareGrants.id, grant.id));
			await tx.insert(hardwareStatusHistory).values({
				inventoryId: grant.inventoryId,
				status: "awarded",
				centerId: grant.centerId,
				holderUserId: grant.recipientUserId,
				recordedByUserId: input.actorId,
			});
			await writeAudit(tx, {
				actorId: input.actorId,
				action: "handover.recorded",
				targetType: "hardware_grant",
				targetId: grant.id,
				ipAddress: input.ip,
				metadata: { grantId: grant.id },
			});
			return { id: row.id };
		});
	} catch (error) {
		if (!isUniqueViolation(error)) throw error;
		throw errors.conflict("This handover is already stored.", {
			reason: "closed",
		});
	}
}
