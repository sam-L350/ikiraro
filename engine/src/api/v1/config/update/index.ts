import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize } from "../../../../core/authz/authorize";
import { clientIp } from "../../../../core/http/client-ip";
import {
	type ConfigSetting,
	updateSetting,
} from "../../../../core/operations/config";
import { db } from "../../../../db";

/** Store the next version of a setting that is already on record. */
export async function createConfigUpdate(input: {
	key: string;
	value: number;
}): Promise<ConfigSetting> {
	const user = await requireAuth();
	await authorize({ permission: "admin.manage" });
	return updateSetting(db, {
		key: input.key,
		value: input.value,
		actorId: user.id,
		ip: clientIp(),
	});
}
