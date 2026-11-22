import { requireAuth } from "../../../core/auth/require-auth";
import { authorize } from "../../../core/authz/authorize";
import type { RoleCode } from "../../../core/authz/catalog";
import { listStaff, loadStaffContext } from "../../../core/identity/staff";
import { db } from "../../../db";

/** Staff accounts this person is allowed to see. */
export async function getStaff(): Promise<{
	staff: {
		id: number;
		name: string | null;
		email: string;
		deactivated: boolean;
		mustChangePassword: boolean;
		role: RoleCode;
		roleName: string;
		scopeType: string;
		scopeId: string | null;
	}[];
}> {
	const user = await requireAuth();
	const context = await loadStaffContext(db, user.id);
	if (context.mode === "admin") {
		await authorize({ permission: "admin.manage" });
	} else if (context.mode === "center") {
		await authorize({
			permission: "center.manage",
			resource: { centerId: context.centers[0] },
		});
	}
	return { staff: await listStaff(db, user.id) };
}
