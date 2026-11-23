type CsvRow = {
	action: string;
	actorId: number | null;
	actorName: string | null;
	targetType: string | null;
	targetId: string | null;
	createdAt: string;
};

function cell(value: string): string {
	const guarded = /^[=+\-@]/.test(value) ? `'${value}` : value;
	if (/[",\n\r]/.test(guarded)) return `"${guarded.replaceAll('"', '""')}"`;
	return guarded;
}

/** One spreadsheet of the rows the viewer is allowed to see. */
export function auditCsv(rows: readonly CsvRow[]): string {
	const header = [
		"created_at",
		"action",
		"actor_id",
		"actor_name",
		"target_type",
		"target_id",
	];
	const lines = [header.join(",")];
	for (const row of rows) {
		lines.push(
			[
				row.createdAt,
				row.action,
				row.actorId === null ? "" : String(row.actorId),
				row.actorName ?? "",
				row.targetType ?? "",
				row.targetId ?? "",
			]
				.map(cell)
				.join(","),
		);
	}
	return lines.join("\n");
}
