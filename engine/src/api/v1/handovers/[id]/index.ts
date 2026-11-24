import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize } from "../../../../core/authz/authorize";
import {
	type HandoverDetail,
	readHandover,
} from "../../../../core/hardware/handover";
import { db } from "../../../../db";

/** The form, the witnesses at the center, and the custody trail. */
export async function getHandover(input: {
	id: string;
}): Promise<HandoverDetail> {
	const user = await requireAuth();
	await authorize({ permission: "hardware.manage" });
	return readHandover(db, input.id, user.id);
}
