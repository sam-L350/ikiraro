import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq, inArray, sql } from "drizzle-orm";
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
	await seedDistrictCenters(database, divisions);
	await retireFixtureCenters(database);
}

function sectorForDistrict(
	divisions: Divisions,
	district: District,
): Sector | undefined {
	const local = divisions.sectors.filter(
		(sector) => sector.districtCode === district.code,
	);
	if (district.latitude === null || district.longitude === null)
		return local[0];
	const named = local.find((sector) => sector.name === district.name);
	if (
		named?.latitude !== null &&
		named?.longitude !== null &&
		named !== undefined &&
		Math.abs(named.latitude - district.latitude) < 0.35 &&
		Math.abs(named.longitude - district.longitude) < 0.35
	) {
		return named;
	}
	let best = local[0];
	let bestDistance = Number.POSITIVE_INFINITY;
	for (const sector of local) {
		if (sector.latitude === null || sector.longitude === null) continue;
		const distance =
			(sector.latitude - district.latitude) ** 2 +
			(sector.longitude - district.longitude) ** 2;
		if (distance < bestDistance) {
			best = sector;
			bestDistance = distance;
		}
	}
	return best;
}

/** One center on each district centroid, named for that district. */
async function seedDistrictCenters(
	database: Database,
	divisions: Divisions,
): Promise<void> {
	for (const district of divisions.districts) {
		const sector = sectorForDistrict(divisions, district);
		if (!sector) throw new Error(`Missing sector for ${district.code}`);
		if (district.latitude === null || district.longitude === null) {
			throw new Error(`Missing coordinates for ${district.name}`);
		}
		await ensureCenterAt(
			database,
			sector.code,
			`${district.name} Learning Center`,
			district.latitude,
			district.longitude,
		);
	}
}

async function ensureCenterAt(
	database: Database,
	sectorCode: string,
	name: string,
	latitude: number,
	longitude: number,
): Promise<void> {
	const [sector] = await database
		.select({ id: sectors.id })
		.from(sectors)
		.where(eq(sectors.code, sectorCode))
		.limit(1);
	if (!sector) throw new Error(`Missing sector ${sectorCode}`);
	const [existing] = await database
		.select({ id: learningCenters.id })
		.from(learningCenters)
		.where(eq(learningCenters.name, name))
		.limit(1);
	if (existing) {
		await database
			.update(learningCenters)
			.set({
				sectorId: sector.id,
				latitude,
				longitude,
				active: true,
			})
			.where(eq(learningCenters.id, existing.id));
		return;
	}
	await database.insert(learningCenters).values({
		sectorId: sector.id,
		name,
		latitude,
		longitude,
		active: true,
	});
}

/** Test leftovers sit on invented districts. They are not places in Rwanda. */
async function retireFixtureCenters(database: Database): Promise<void> {
	const fixtures = await database
		.select({ id: learningCenters.id })
		.from(learningCenters)
		.innerJoin(sectors, eq(sectors.id, learningCenters.sectorId))
		.innerJoin(districts, eq(districts.id, sectors.districtId))
		.where(
			sql`${districts.code} not like 'RW%' or ${learningCenters.name} ~ '[0-9a-f]{6,}'`,
		);
	if (fixtures.length > 0) {
		await database
			.update(learningCenters)
			.set({ active: false })
			.where(
				inArray(
					learningCenters.id,
					fixtures.map((row) => row.id),
				),
			);
	}
	await database.execute(sql`
		insert into consents (user_id, purpose, granted, version)
		select latest.user_id, 'leaderboard', false, '1'
		from (
			select distinct on (consent.user_id) consent.user_id, consent.granted
			from consents consent
			inner join users person on person.id = consent.user_id
			inner join learning_centers center on center.id = person.center_id
			inner join sectors sector on sector.id = center.sector_id
			inner join districts district on district.id = sector.district_id
			where consent.purpose = 'leaderboard'
				and district.code not like 'RW%'
			order by consent.user_id, consent.granted_at desc
		) latest
		where latest.granted = true
	`);
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
