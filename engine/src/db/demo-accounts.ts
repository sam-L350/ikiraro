import { eq } from "drizzle-orm";
import { env } from "../config/env";
import { hashPassword } from "../core/auth/password";
import type { RoleCode } from "../core/authz/catalog";
import { previewAssignment } from "../core/authz/preview";
import { createUserWithPassport } from "../core/identity/create-user";
import { db } from "./index";
import { digitalPassports, roles, userRoles, users } from "./schema";

/** Shared development password. Production seed never creates these accounts. */
export const DEMO_PASSWORD = "Ikiraro-demo-1";

export const DEMO_ACCOUNTS: readonly {
	email: string;
	name: string;
	role: RoleCode;
}[] = [
	{ email: "learner@demo.ikiraro.test", name: "Demo Learner", role: "learner" },
	{ email: "trainer@demo.ikiraro.test", name: "Demo Trainer", role: "trainer" },
	{
		email: "manager@demo.ikiraro.test",
		name: "Demo Center manager",
		role: "center_manager",
	},
	{
		email: "coordinator@demo.ikiraro.test",
		name: "Demo Coordinator",
		role: "district_coordinator",
	},
	{
		email: "author@demo.ikiraro.test",
		name: "Demo Author",
		role: "content_author",
	},
	{
		email: "reviewer@demo.ikiraro.test",
		name: "Demo Reviewer",
		role: "content_reviewer",
	},
	{
		email: "hardware@demo.ikiraro.test",
		name: "Demo Hardware officer",
		role: "hardware_officer",
	},
	{
		email: "committee@demo.ikiraro.test",
		name: "Demo Committee member",
		role: "committee_member",
	},
	{ email: "auditor@demo.ikiraro.test", name: "Demo Auditor", role: "auditor" },
	{
		email: "admin@demo.ikiraro.test",
		name: "Demo Platform admin",
		role: "platform_admin",
	},
	{ email: "mentor@demo.ikiraro.test", name: "Demo Mentor", role: "mentor" },
	{
		email: "verifier@demo.ikiraro.test",
		name: "Demo Public verifier",
		role: "public_verifier",
	},
];

/** Creates one signed-in account per role. Safe to re-run. Skipped in production. */
export async function seedDemoAccounts(): Promise<void> {
	if (env.isProduction) return;
	const passwordHash = await hashPassword(DEMO_PASSWORD);
	const roleRows = await db
		.select({ id: roles.id, code: roles.code })
		.from(roles);

	for (const account of DEMO_ACCOUNTS) {
		const role = roleRows.find((row) => row.code === account.role);
		if (!role) throw new Error(`Missing role ${account.role}`);

		const [existing] = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.email, account.email))
			.limit(1);
		const userId = existing
			? existing.id
			: (
					await createUserWithPassport(db, {
						email: account.email,
						name: account.name,
					})
				).userId;

		await db
			.update(users)
			.set({
				name: account.name,
				passwordHash,
				mustChangePassword: false,
			})
			.where(eq(users.id, userId));

		const [passport] = await db
			.select({ id: digitalPassports.id })
			.from(digitalPassports)
			.where(eq(digitalPassports.userId, userId))
			.limit(1);
		if (!passport) {
			await db.insert(digitalPassports).values({ userId });
		}

		const scope = previewAssignment(account.role, userId);
		await db.delete(userRoles).where(eq(userRoles.userId, userId));
		await db.insert(userRoles).values({
			userId,
			roleId: role.id,
			scopeType: scope.scopeType,
			scopeId: scope.scopeId,
		});
	}
}
