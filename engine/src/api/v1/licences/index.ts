import { requireAuth } from "../../../core/auth/require-auth";
import { loadAssignments } from "../../../core/authz/authorize";
import {
	type LicenceList,
	readLicences,
} from "../../../core/portable/portable";
import { db } from "../../../db";

/** Donated programs, the seats in use, and the learners an officer can choose. */
export async function getLicences(): Promise<LicenceList> {
	const user = await requireAuth();
	return readLicences(db, await loadAssignments(user.id));
}
