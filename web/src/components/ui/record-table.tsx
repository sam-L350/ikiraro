import type { ReactNode } from "react";

export function RecordTable({
	caption,
	columns,
	rows,
}: {
	caption: string;
	columns: readonly string[];
	rows: readonly {
		key: string;
		cells: readonly ReactNode[];
	}[];
}) {
	const headers = columns.map((label, position) => ({
		id: `${label}#${position}`,
		label,
	}));
	return (
		<div className="overflow-x-auto rounded-[20px] bg-surface">
			<table className="w-full border-collapse text-left">
				<caption className="sr-only">{caption}</caption>
				<thead>
					<tr className="font-meta text-xs uppercase text-fg-muted">
						{headers.map((header) => (
							<th
								key={header.id}
								className="border-b border-line px-4 py-3 font-semibold"
							>
								{header.label}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => (
						<tr key={row.key}>
							{headers.map((header) => (
								<td
									key={`${row.key}-${header.id}`}
									className="border-b border-line px-4 py-3 align-top font-sans text-base font-medium text-fg"
								>
									{row.cells[headers.indexOf(header)]}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
