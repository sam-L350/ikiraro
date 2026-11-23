import { requireAuth } from "../../../core/auth/require-auth";
import {
	loadOperations,
	type OperationsSnapshot,
} from "../../../core/operations/snapshot";
import { db } from "../../../db";

/** The operational numbers for this person's roles. */
export async function getOperations(): Promise<OperationsSnapshot> {
	const user = await requireAuth();
	return loadOperations(db, user.id);
}
