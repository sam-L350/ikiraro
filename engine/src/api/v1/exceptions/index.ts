import { requireAuth } from "../../../core/auth/require-auth";
import { authorize } from "../../../core/authz/authorize";
import {
	type ExceptionGrant,
	type GrantExceptionView,
	listExceptions,
} from "../../../core/hardware/recovery";
import { db } from "../../../db";

/** Open and decided exceptions, plus the grants a request can name. */
export async function getExceptions(): Promise<{
	exceptions: GrantExceptionView[];
	grants: ExceptionGrant[];
}> {
	const user = await requireAuth();
	await authorize({ permission: "admin.manage" });
	return listExceptions(db, user.id);
}
