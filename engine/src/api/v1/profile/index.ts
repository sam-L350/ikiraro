import { requireAuth } from "../../../core/auth/require-auth";
import { authorize } from "../../../core/authz/authorize";
import { type Profile, readProfile } from "../../../core/identity/profile";
import { db } from "../../../db";

/** The signed-in person's profile, including the latest consent for each purpose. */
export async function getProfile(): Promise<Profile> {
	const user = await requireAuth();
	await authorize({
		permission: "profile.read.self",
		resource: { ownerId: String(user.id) },
	});
	return readProfile(db, user.id);
}
