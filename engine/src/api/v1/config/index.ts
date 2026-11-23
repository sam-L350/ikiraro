import { requireAuth } from "../../../core/auth/require-auth";
import { authorize } from "../../../core/authz/authorize";
import {
	type ConfigSetting,
	listSettings,
} from "../../../core/operations/config";
import { db } from "../../../db";

/** Newest stored value for each configuration key. */
export async function listConfig(): Promise<ConfigSetting[]> {
	await requireAuth();
	await authorize({ permission: "admin.manage" });
	return listSettings(db);
}
