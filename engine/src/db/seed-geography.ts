import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import type { Database } from "./index";
import {
	centerStaff,
	districts,
	learningCenters,
	provinces,
	roles,
	sectors,
	userRoles,
	users,
} from "./schema";

type Division = {
	code: string;
	name: string;
	latitude: number | null;
	longitude: number | null;
};

type District = Division & { provinceCode: string };
type Sector = Division & { districtCode: string };

type Divisions = {
	provinces: Division[];
	districts: District[];
	sectors: Sector[];
};

const GITEGA_SECTOR = "RW1101";
const HUYE_SECTOR = "RW2401";

/**
 * Provinces, districts, and sectors from Open Admin Data
 * (Rwanda administrative divisions, CC-BY-4.0).
 * https://github.com/open-admin-data/rwanda-administrative-divisions
 */
function readDivisions(): Divisions {
	const path = resolve(
		dirname(fileURLToPath(import.meta.url)),
		"rwanda-divisions.json",
	);
	return JSON.parse(readFileSync(path, "utf8")) as Divisions;
}

/** Inserts the geography hierarchy and two learning centers. Safe to re-run. */
export async function seedGeography(database: Database): Promise<void> {
	const divisions = readDivisions();
	await database
		.insert(provinces)
		.values(divisions.provinces)
		.onConflictDoNothing({ target: provinces.code });
	const provinceRows = await database
		.select({ id: provinces.id, code: provinces.code })
		.from(provinces);
	const provinceId = new Map(provinceRows.map((row) => [row.code, row.id]));

	const districtValues = divisions.districts.map((district) => {
		const parent = provinceId.get(district.provinceCode);
		if (!parent) throw new Error(`Missing province ${district.provinceCode}`);
		return {
			code: district.code,
			name: district.name,
			provinceId: parent,
			latitude: district.latitude,
			longitude: district.longitude,
		};
	});
	await database
		.insert(districts)
		.values(districtValues)
		.onConflictDoNothing({ target: districts.code });
	const districtRows = await database
		.select({ id: districts.id, code: districts.code })
		.from(districts);
	const districtId = new Map(districtRows.map((row) => [row.code, row.id]));

	const sectorValues = divisions.sectors.map((sector) => {
		const parent = districtId.get(sector.districtCode);
		if (!parent) throw new Error(`Missing district ${sector.districtCode}`);
		return {
			code: sector.code,
			name: sector.name,
			districtId: parent,
			latitude: sector.latitude,
			longitude: sector.longitude,
		};
	});
	await database
		.insert(sectors)
		.values(sectorValues)
		.onConflictDoNothing({ target: sectors.code });

	await ensureCenter(database, GITEGA_SECTOR, "Gitega Learning Center");
	await ensureCenter(database, HUYE_SECTOR, "Huye Learning Center");
}

async function ensureCenter(
	database: Database,
	sectorCode: string,
	name: string,
): Promise<void> {
	const [existing] = await database
		.select({ id: learningCenters.id })
		.from(learningCenters)
		.where(eq(learningCenters.name, name))
		.limit(1);
	if (existing) return;
	const [sector] = await database
		.select({
			id: sectors.id,
			latitude: sectors.latitude,
			longitude: sectors.longitude,
		})
		.from(sectors)
		.where(eq(sectors.code, sectorCode))
		.limit(1);
	if (!sector) throw new Error(`Missing sector ${sectorCode}`);
	await database.insert(learningCenters).values({
		sectorId: sector.id,
		name,
		latitude: sector.latitude,
		longitude: sector.longitude,
		active: true,
	});
}

/** Puts the demo trainer on both centers, the manager on one, and the learner at home. */
export async function seedCenterAssignments(database: Database): Promise<void> {
	const centers = await database
		.select({ id: learningCenters.id, name: learningCenters.name })
		.from(learningCenters);
	const gitega = centers.find(
		(center) => center.name === "Gitega Learning Center",
	);
	const huye = centers.find((center) => center.name === "Huye Learning Center");
	if (!gitega || !huye) return;

	const accounts = await database
		.select({ id: users.id, email: users.email })
		.from(users);
	const idOf = (email: string) =>
		accounts.find((account) => account.email === email)?.id;

	const trainer = idOf("trainer@demo.ikiraro.test");
	const manager = idOf("manager@demo.ikiraro.test");
	const learner = idOf("learner@demo.ikiraro.test");

	if (trainer) {
		await link(database, gitega.id, trainer, "trainer");
		await link(database, huye.id, trainer, "trainer");
	}
	if (manager) await link(database, gitega.id, manager, "center_manager");
	if (learner) {
		await database
			.update(users)
			.set({ centerId: gitega.id })
			.where(eq(users.id, learner));
	}

	const [nyarugenge] = await database
		.select({ id: districts.id })
		.from(districts)
		.where(eq(districts.code, "RW11"))
		.limit(1);
	await pointScope(database, trainer, "center", gitega.id);
	await pointScope(database, manager, "center", gitega.id);
	await pointScope(
		database,
		idOf("coordinator@demo.ikiraro.test"),
		"district",
		nyarugenge?.id,
	);
}

async function pointScope(
	database: Database,
	userId: number | undefined,
	scopeType: string,
	scopeId: string | undefined,
): Promise<void> {
	if (!userId || !scopeId) return;
	const [role] = await database
		.select({ id: roles.id })
		.from(roles)
		.innerJoin(userRoles, eq(userRoles.roleId, roles.id))
		.where(
			and(eq(userRoles.userId, userId), eq(userRoles.scopeType, scopeType)),
		)
		.limit(1);
	if (!role) return;
	await database
		.update(userRoles)
		.set({ scopeId })
		.where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, role.id)));
}

async function link(
	database: Database,
	centerId: string,
	userId: number,
	role: "trainer" | "center_manager",
): Promise<void> {
	await database
		.insert(centerStaff)
		.values({ centerId, userId, role })
		.onConflictDoNothing({
			target: [centerStaff.centerId, centerStaff.userId, centerStaff.role],
		});
}
