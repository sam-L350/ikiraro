import { requireAuth } from "../../../../core/auth/require-auth";
import { authorize } from "../../../../core/authz/authorize";
import type { RoleCode } from "../../../../core/authz/catalog";
import type { ScopeType } from "../../../../core/authz/decide";
import { readAssignments, staffContext } from "../../../../core/identity/staff";
import { db } from "../../../../db";

/** What the signed-in person is allowed to grant. */
export async function getStaffContext(): Promise<{
	mode: "admin" | "center" | "none";
	centers: string[];
	roles: { code: RoleCode; name: string; scopeType: ScopeType }[];
}> {
	const user = await requireAuth();
	const context = staffContext(await readAssignments(db, user.id));
	if (context.mode === "admin") {
		await authorize({ permission: "admin.manage" });
	} else if (context.mode === "center") {
		await authorize({
			permission: "center.manage",
			resource: { centerId: context.centers[0] },
		});
	}
	return context;
}
