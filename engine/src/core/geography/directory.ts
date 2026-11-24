import { and, asc, eq, or, sql } from "drizzle-orm";
import type { Database } from "../../db";
import {
	districts,
	learningCenters,
	provinces,
	sectors,
} from "../../db/schema";

const LIST_LIMIT = 200;

type DirectoryDb = Pick<Database, "select">;

export type DirectoryCenter = {
	id: string;
	name: string;
	sector: string;
	district: string;
	province: string;
	latitude: number | null;
	longitude: number | null;
	distanceKm: number | null;
	mapX: number | null;
	mapY: number | null;
};

export type MapPoint = { x: number; y: number };

/** Rwanda, with a little padding so a center on the border still lands on the map. */
export const RWANDA_BOUNDS = {
	west: 28.8,
	east: 30.95,
	south: -2.9,
	north: -1.0,
};

/** Where a coordinate sits on the directory map. Outside Rwanda returns null. */
export function placeOnMap(
	latitude: number,
	longitude: number,
): MapPoint | null {
	const { west, east, south, north } = RWANDA_BOUNDS;
	if (
		longitude < west ||
		longitude > east ||
		latitude < south ||
		latitude > north
	) {
		return null;
	}
	return {
		x: (longitude - west) / (east - west),
		y: (north - latitude) / (north - south),
	};
}

/** Kilometres between two points. */
export function distanceKm(
	from: { latitude: number; longitude: number },
	to: { latitude: number; longitude: number },
): number {
	const earth = 6371;
	const dLat = radians(to.latitude - from.latitude);
	const dLng = radians(to.longitude - from.longitude);
	const lat1 = radians(from.latitude);
	const lat2 = radians(to.latitude);
	const h =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
	return 2 * earth * Math.asin(Math.min(1, Math.sqrt(h)));
}

function radians(degrees: number): number {
	return (degrees * Math.PI) / 180;
}

function searchPattern(query: string): string | null {
	const text = query.trim().slice(0, 80);
	if (!text) return null;
	return `%${text.replace(/[%_]/g, "")}%`;
}

/** Active centers, filtered by a name or place, nearest first when a point is given. */
export async function searchDirectory(
	database: DirectoryDb,
	input: { q?: string; latitude?: number; longitude?: number },
): Promise<{ items: DirectoryCenter[] }> {
	const pattern = input.q ? searchPattern(input.q) : null;
	const origin =
		typeof input.latitude === "number" &&
		typeof input.longitude === "number" &&
		Number.isFinite(input.latitude) &&
		Number.isFinite(input.longitude)
			? { latitude: input.latitude, longitude: input.longitude }
			: null;
	const rows = await database
		.select({
			id: learningCenters.id,
			name: learningCenters.name,
			sector: sectors.name,
			district: districts.name,
			province: provinces.name,
			latitude: learningCenters.latitude,
			longitude: learningCenters.longitude,
		})
		.from(learningCenters)
		.innerJoin(sectors, eq(sectors.id, learningCenters.sectorId))
		.innerJoin(districts, eq(districts.id, sectors.districtId))
		.innerJoin(provinces, eq(provinces.id, districts.provinceId))
		.where(
			and(
				eq(learningCenters.active, true),
				pattern
					? or(
							sql`${learningCenters.name} ilike ${pattern}`,
							sql`${sectors.name} ilike ${pattern}`,
							sql`${districts.name} ilike ${pattern}`,
							sql`${provinces.name} ilike ${pattern}`,
						)
					: undefined,
			),
		)
		.orderBy(asc(learningCenters.name))
		.limit(LIST_LIMIT);
	const items = rows.map((row) => {
		const distance =
			origin && row.latitude !== null && row.longitude !== null
				? Math.round(
						distanceKm(origin, {
							latitude: row.latitude,
							longitude: row.longitude,
						}) * 10,
					) / 10
				: null;
		const point =
			row.latitude !== null && row.longitude !== null
				? placeOnMap(row.latitude, row.longitude)
				: null;
		return {
			...row,
			distanceKm: distance,
			mapX: point?.x ?? null,
			mapY: point?.y ?? null,
		};
	});
	if (!origin) return { items };
	items.sort((left, right) => {
		if (left.distanceKm === null) return 1;
		if (right.distanceKm === null) return -1;
		return left.distanceKm - right.distanceKm;
	});
	return { items };
}
