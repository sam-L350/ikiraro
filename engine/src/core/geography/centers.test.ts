import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { useTestEnv } from "../../../test/helpers";
import * as schema from "../../db/schema";
import { centerStaff, roles, userRoles } from "../../db/schema";
import { isApiError } from "../api/error";
import { decideAccess } from "../authz/decide";
import { createUserWithPassport } from "../identity/create-user";
import {
	centerStaffByRole,
	expandCenterAssignments,
	listAssignedCenters,
	readAssignedCenter,
} from "./centers";

function isUsable(url: string): boolean {
	try {
		return new URL(url).hostname !== "db";
	} catch {
		return false;
	}
}

function databaseUrl(): string | null {
	const fromEnv = process.env.DATABASE_URL;
	if (fromEnv && isUsable(fromEnv)) return fromEnv;
	try {
		const path = resolve(
			dirname(fileURLToPath(import.meta.url)),
			"../../../.env.local",
		);
		const text = readFileSync(path, "utf8");
		for (const line of text.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed.startsWith("DATABASE_URL=")) continue;
			const value = trimmed
				.slice("DATABASE_URL=".length)
				.trim()
				.replace(/^['"]|['"]$/g, "");
			if (isUsable(value)) return value;
		}
	} catch {
		return null;
	}
	return null;
}

function openDatabase() {
	const url = databaseUrl();
	if (!url) return null;
	const client = postgres(url, { max: 1, connect_timeout: 15 });
	return { client, db: drizzle({ client, schema }) };
}

const suite = openDatabase();

afterAll(async () => {
	await suite?.client.end({ timeout: 5 });
});

beforeEach(() => {
	useTestEnv();
});

async function insertCenter(
	database: NonNullable<typeof suite>["db"],
	name: string,
): Promise<string> {
	const code = crypto.randomUUID().slice(0, 8);
	const [province] = await database
		.insert(schema.provinces)
		.values({ code: `p-${code}`, name: `Province ${code}` })
		.returning({ id: schema.provinces.id });
	if (!province) throw new Error("province was not stored");
	const [district] = await database
		.insert(schema.districts)
		.values({
			code: `d-${code}`,
			name: `District ${code}`,
			provinceId: province.id,
		})
		.returning({ id: schema.districts.id });
	if (!district) throw new Error("district was not stored");
	const [sector] = await database
		.insert(schema.sectors)
		.values({
			code: `s-${code}`,
			name: `Sector ${code}`,
			districtId: district.id,
		})
		.returning({ id: schema.sectors.id });
	if (!sector) throw new Error("sector was not stored");
	const [center] = await database
		.insert(schema.learningCenters)
		.values({ sectorId: sector.id, name, active: true })
		.returning({ id: schema.learningCenters.id });
	if (!center) throw new Error("center was not stored");
	return center.id;
}

describe.serial("center staff scope", () => {
	test.skipIf(suite === null)(
		"a trainer with two centers sees both and not a third",
		async () => {
			if (!suite) return;
			const first = await insertCenter(
				suite.db,
				`Gitega ${crypto.randomUUID()}`,
			);
			const second = await insertCenter(
				suite.db,
				`Huye ${crypto.randomUUID()}`,
			);
			const third = await insertCenter(
				suite.db,
				`Other ${crypto.randomUUID()}`,
			);
			const trainer = await createUserWithPassport(suite.db, {
				email: `trainer-${crypto.randomUUID()}@example.com`,
				name: "Two Centers",
			});
			const [role] = await suite.db
				.select({ id: roles.id })
				.from(roles)
				.where(eq(roles.code, "trainer"))
				.limit(1);
			if (!role) throw new Error("trainer role is missing");
			await suite.db.insert(userRoles).values({
				userId: trainer.userId,
				roleId: role.id,
				scopeType: "center",
				scopeId: "dev-center",
			});
			await suite.db.insert(centerStaff).values([
				{ centerId: first, userId: trainer.userId, role: "trainer" },
				{ centerId: second, userId: trainer.userId, role: "trainer" },
			]);

			const grouped = await centerStaffByRole(suite.db, trainer.userId);
			const assignments = expandCenterAssignments(
				[
					{
						role: "trainer",
						scopeType: "center",
						scopeId: "dev-center",
					},
				],
				grouped,
			);
			expect(
				decideAccess({
					actorId: String(trainer.userId),
					assignments,
					permission: "submission.review",
					resource: { centerId: first },
				}).ok,
			).toBe(true);
			expect(
				decideAccess({
					actorId: String(trainer.userId),
					assignments,
					permission: "submission.review",
					resource: { centerId: third },
				}).ok,
			).toBe(false);

			const visible = await listAssignedCenters(suite.db, trainer.userId, null);
			const ids = visible.map((center) => center.id);
			expect(ids).toContain(first);
			expect(ids).toContain(second);
			expect(ids).not.toContain(third);

			const hidden = await readAssignedCenter(
				suite.db,
				trainer.userId,
				null,
				third,
			).then(
				() => null,
				(error: unknown) => error,
			);
			expect(isApiError(hidden)).toBe(true);
			if (isApiError(hidden)) expect(hidden.status).toBe(404);
		},
		30_000,
	);
});
