import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useEngine } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

type DirectoryCenter = {
	id: string;
	name: string;
	sector: string;
	district: string;
	province: string;
	mapX: number | null;
	mapY: number | null;
	distanceKm: number | null;
};

export default function DirectoryPage() {
	const { t } = useI18n();
	const [query, setQuery] = useState("");
	const [origin, setOrigin] = useState<{
		latitude: number;
		longitude: number;
	} | null>(null);
	const [denied, setDenied] = useState(false);
	const directory = useEngine("/directory", {
		query: {
			...(query.trim() ? { q: query.trim() } : {}),
			...(origin ?? {}),
		},
	});

	function onNear() {
		setDenied(false);
		if (!navigator.geolocation) {
			setDenied(true);
			return;
		}
		navigator.geolocation.getCurrentPosition(
			(position) => {
				setOrigin({
					latitude: position.coords.latitude,
					longitude: position.coords.longitude,
				});
			},
			() => setDenied(true),
		);
	}

	const items = (directory.data?.items ?? []) as DirectoryCenter[];
	const placed = items.filter(
		(item) => item.mapX !== null && item.mapY !== null,
	);
	const unmapped = items.filter(
		(item) => item.mapX === null || item.mapY === null,
	);

	return (
		<section className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-16 lg:px-12">
			<div>
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg sm:text-5xl">
					{t("directoryTitle")}
				</h1>
				<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
					{t("directorySentence")}
				</p>
			</div>
			<div className="flex flex-col gap-4 sm:flex-row sm:items-end">
				<label
					className="flex flex-1 flex-col gap-2"
					htmlFor="directory-search"
				>
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("directorySearch")}
					</span>
					<input
						id="directory-search"
						className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
					/>
				</label>
				<Button
					type="button"
					variant="quiet"
					className="w-fit"
					onClick={onNear}
				>
					{t("directoryNear")}
				</Button>
			</div>
			{denied ? (
				<p className="font-sans text-sm font-medium text-fg">
					{t("directoryNearUnavailable")}
				</p>
			) : null}
			{directory.isPending ? (
				<div className="h-40 animate-pulse rounded-md bg-surface" />
			) : directory.error ? (
				<p className="text-lg text-destructive">{t("tryAgain")}</p>
			) : items.length === 0 ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("directoryEmpty")}
				</p>
			) : (
				<div className="grid gap-10 lg:grid-cols-[minmax(0,16rem)_1fr]">
					<svg
						viewBox="0 0 100 120"
						className="w-full rounded-md border border-line bg-card"
						role="img"
						aria-label={t("directoryTitle")}
					>
						<rect width="100" height="120" fill="var(--card)" />
						{placed.map((item) => (
							<circle
								key={item.id}
								cx={(item.mapX ?? 0) * 100}
								cy={(item.mapY ?? 0) * 120}
								r={2.2}
								fill="var(--ink)"
							>
								<title>{item.name}</title>
							</circle>
						))}
					</svg>
					<table className="w-full border-collapse text-left">
						<thead>
							<tr className="font-meta text-xs uppercase text-fg-muted">
								<th className="border-b border-line py-2 font-semibold">
									{t("directoryCenter")}
								</th>
								<th className="border-b border-line py-2 font-semibold">
									{t("directorySector")}
								</th>
								<th className="border-b border-line py-2 font-semibold">
									{t("directoryDistrict")}
								</th>
								<th className="border-b border-line py-2 font-semibold">
									{t("directoryDistance")}
								</th>
							</tr>
						</thead>
						<tbody>
							{items.map((item) => (
								<tr key={item.id}>
									<td className="border-b border-line py-3 font-sans text-lg text-fg">
										{item.name}
									</td>
									<td className="border-b border-line py-3 font-sans text-lg text-fg">
										{item.sector}
									</td>
									<td className="border-b border-line py-3 font-sans text-lg text-fg">
										{item.district}
									</td>
									<td className="border-b border-line py-3 font-sans text-lg text-fg">
										{item.distanceKm === null
											? ""
											: t("directoryKm", { count: String(item.distanceKm) })}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
			{unmapped.length > 0 && items.length > 0 ? (
				<p className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
					{t("directoryUnmapped")}:{" "}
					{unmapped.map((item) => item.name).join(", ")}
				</p>
			) : null}
		</section>
	);
}
