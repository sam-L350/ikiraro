import { eq } from "drizzle-orm";
import {
	DEFAULT_SHARED_IDLE_MS,
	SHARED_IDLE_KEY,
} from "../core/auth/shared-idle";
import {
	PERMISSION_CODES,
	PERMISSION_DESCRIPTIONS,
	ROLE_CODES,
	ROLE_NAMES,
	ROLE_PERMISSIONS,
	type RoleCode,
} from "../core/authz/catalog";
import { seedDemoAccounts } from "./demo-accounts";
import { db } from "./index";
import { configSettings, permissions, rolePermissions, roles } from "./schema";
import { seedCenterAssignments, seedGeography } from "./seed-geography";

function isRoleCode(value: string): value is RoleCode {
	return (ROLE_CODES as readonly string[]).includes(value);
}

/** Inserts the twelve roles and the phase-0 permission catalogue. Safe to re-run. */
export async function seedFoundations(): Promise<void> {
	for (const code of ROLE_CODES) {
		await db
			.insert(roles)
			.values({ code, name: ROLE_NAMES[code] })
			.onConflictDoNothing({ target: roles.code });
	}
	for (const code of PERMISSION_CODES) {
		await db
			.insert(permissions)
			.values({ code, description: PERMISSION_DESCRIPTIONS[code] })
			.onConflictDoNothing({ target: permissions.code });
	}

	const roleRows = await db.select().from(roles);
	const permissionRows = await db.select().from(permissions);
	for (const role of roleRows) {
		if (!isRoleCode(role.code)) continue;
		for (const permissionCode of ROLE_PERMISSIONS[role.code]) {
			const permission = permissionRows.find(
				(row) => row.code === permissionCode,
			);
			if (!permission) continue;
			await db
				.insert(rolePermissions)
				.values({ roleId: role.id, permissionId: permission.id })
				.onConflictDoNothing({
					target: [rolePermissions.roleId, rolePermissions.permissionId],
				});
		}
	}

	const stored = await db
		.select({ code: roles.code })
		.from(roles)
		.where(eq(roles.code, "learner"));
	if (stored.length !== 1) {
		throw new Error("Foundation seed did not store the learner role");
	}

	const [idle] = await db
		.select({ version: configSettings.version })
		.from(configSettings)
		.where(eq(configSettings.key, SHARED_IDLE_KEY))
		.limit(1);
	if (!idle) {
		await db.insert(configSettings).values({
			key: SHARED_IDLE_KEY,
			value: DEFAULT_SHARED_IDLE_MS,
			version: 1,
		});
	}

	await seedGeography(db);
	await seedDemoAccounts();
	await seedCenterAssignments(db);
}
