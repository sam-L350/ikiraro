export type MisconductAccess = "own" | "review" | "none";

export type MisconductViewer = {
	userId: number;
	centerIds: readonly string[];
	admin: boolean;
	districtIds: readonly string[];
};

export type MisconductCase = {
	reporterUserId: number;
	reporterCenterIds: readonly string[];
	accusedCenterId: string;
	accusedDistrictId: string;
};

/**
 * The reporter can read their own concern.
 * Anyone who works at the accused center, or at one of the reporter's centers, cannot.
 * A platform admin, or a coordinator for that district, can read it from outside.
 */
export function misconductAccess(
	viewer: MisconductViewer,
	report: MisconductCase,
): MisconductAccess {
	if (viewer.userId === report.reporterUserId) return "own";
	const blocked = new Set<string>([
		report.accusedCenterId,
		...report.reporterCenterIds,
	]);
	if (viewer.centerIds.some((centerId) => blocked.has(centerId))) {
		return "none";
	}
	if (viewer.admin) return "review";
	if (viewer.districtIds.includes(report.accusedDistrictId)) return "review";
	return "none";
}
