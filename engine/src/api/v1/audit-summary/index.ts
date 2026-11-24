import {
	listPublicExceptions,
	type PublicException,
} from "../../../core/hardware/recovery";
import { db } from "../../../db";

/** Approved exceptions. Names and serials are not included. No sign-in is required. */
export async function getAuditSummary(): Promise<{ items: PublicException[] }> {
	return { items: await listPublicExceptions(db) };
}
