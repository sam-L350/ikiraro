import { Link } from "react-router";

type Row = {
	key: string;
	label: string;
	value: number;
};

export function BarList({
	caption,
	rows,
	href,
	openLabel,
}: {
	caption: string;
	rows: readonly Row[];
	href?: string;
	openLabel?: string;
}) {
	if (rows.length === 0) return null;
	const max = Math.max(1, ...rows.map((row) => row.value));
	return (
		<section className="flex flex-col gap-4 rounded-md border border-line bg-card p-4">
			<div className="flex items-baseline justify-between gap-3">
				<h2 className="font-sans text-xl font-semibold text-fg">{caption}</h2>
				{href && openLabel ? (
					<Link
						to={href}
						className="font-sans text-sm font-semibold text-fg underline"
					>
						{openLabel}
					</Link>
				) : null}
			</div>
			<ul className="flex flex-col gap-3">
				{rows.map((row) => (
					<li key={row.key}>
						<div className="mb-1 flex items-baseline justify-between gap-3">
							<span className="font-sans text-sm font-medium text-fg">
								{row.label}
							</span>
							<span className="font-meta text-sm text-fg">{row.value}</span>
						</div>
						<div className="h-2 overflow-hidden rounded-full bg-surface">
							<div
								className="h-full rounded-full bg-ink"
								style={{ width: `${Math.round((row.value / max) * 100)}%` }}
							/>
						</div>
					</li>
				))}
			</ul>
		</section>
	);
}

type PairRow = {
	key: string;
	label: string;
	left: number;
	right: number;
};

export function PairBars({
	caption,
	leftLabel,
	rightLabel,
	rows,
	href,
	openLabel,
}: {
	caption: string;
	leftLabel: string;
	rightLabel: string;
	rows: readonly PairRow[];
	href?: string;
	openLabel?: string;
}) {
	if (rows.length === 0) return null;
	return (
		<section className="flex flex-col gap-4 rounded-md border border-line bg-card p-4">
			<div className="flex items-baseline justify-between gap-3">
				<h2 className="font-sans text-xl font-semibold text-fg">{caption}</h2>
				{href && openLabel ? (
					<Link
						to={href}
						className="font-sans text-sm font-semibold text-fg underline"
					>
						{openLabel}
					</Link>
				) : null}
			</div>
			<p className="flex gap-4 font-meta text-xs uppercase text-fg-muted">
				<span className="inline-flex items-center gap-2">
					<span className="size-2 rounded-full bg-ink" />
					{leftLabel}
				</span>
				<span className="inline-flex items-center gap-2">
					<span className="size-2 rounded-full bg-ink/40" />
					{rightLabel}
				</span>
			</p>
			<ul className="flex flex-col gap-4">
				{rows.map((row) => {
					const span = Math.max(row.left, row.right, 1);
					return (
						<li key={row.key}>
							<div className="mb-1 flex items-baseline justify-between gap-3">
								<span className="font-sans text-sm font-medium text-fg">
									{row.label}
								</span>
								<span className="font-meta text-sm text-fg">
									{row.left} · {row.right}
								</span>
							</div>
							<div className="flex flex-col gap-1">
								<div className="h-2 overflow-hidden rounded-full bg-surface">
									<div
										className="h-full rounded-full bg-ink"
										style={{
											width: `${Math.round((row.left / span) * 100)}%`,
										}}
									/>
								</div>
								<div className="h-2 overflow-hidden rounded-full bg-surface">
									<div
										className="h-full rounded-full bg-ink/40"
										style={{
											width: `${Math.round((row.right / span) * 100)}%`,
										}}
									/>
								</div>
							</div>
						</li>
					);
				})}
			</ul>
		</section>
	);
}
