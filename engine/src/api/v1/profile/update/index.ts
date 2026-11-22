import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize } from "../../../../core/authz/authorize";
import { clientIp } from "../../../../core/http/client-ip";
import {
	type Profile,
	type ProfilePatch,
	updateProfile as saveProfile,
} from "../../../../core/identity/profile";
import { db } from "../../../../db";

/** Replaces the fields the signed-in person sends. Omitted fields stay as they are. */
export async function updateProfile(input: ProfilePatch): Promise<Profile> {
	const user = await requireAuth();
	await authorize({
		permission: "profile.write.self",
		resource: { ownerId: String(user.id) },
	});
	return saveProfile(db, user.id, input, clientIp());
}
