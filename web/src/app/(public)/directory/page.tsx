import { useState } from "react";
import { RwandaMap } from "@/components/public/rwanda-map";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEngine } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

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
	const [selectedId, setSelectedId] = useState<string | null>(null);
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
	const placed = items.flatMap((item) =>
		item.mapX === null || item.mapY === null
			? []
			: [{ id: item.id, name: item.name, mapX: item.mapX, mapY: item.mapY }],
	);
	const unmapped = items.filter(
		(item) => item.mapX === null || item.mapY === null,
	);
	const selected = items.find((item) => item.id === selectedId) ?? null;

	return (
		<section className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-16 lg:px-12">
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
					<Input
						id="directory-search"
						className="h-11 font-sans text-lg"
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
				<div className="h-80 animate-pulse rounded-[20px] bg-surface" />
			) : directory.error ? (
				<p className="text-lg text-destructive">{t("tryAgain")}</p>
			) : items.length === 0 ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("directoryEmpty")}
				</p>
			) : (
				<div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
					<div className="rounded-[20px] bg-canvas p-4 sm:p-6">
						<RwandaMap
							centers={placed}
							selectedId={selectedId}
							onSelect={setSelectedId}
							label={t("directoryMap")}
						/>
						{selected ? (
							<p className="mt-4 font-sans text-lg font-semibold text-fg">
								{selected.name}
								<span className="mt-1 block font-medium">
									{selected.sector} · {selected.district} · {selected.province}
								</span>
							</p>
						) : (
							<p className="mt-4 font-sans text-sm font-medium text-fg">
								{t("directoryMapHint")}
							</p>
						)}
					</div>
					<ul className="max-h-[36rem] overflow-y-auto">
						{items.map((item) => {
							const active = item.id === selectedId;
							return (
								<li key={item.id}>
									<button
										type="button"
										className={cn(
											"flex w-full flex-col gap-1 border-b border-line py-3 text-left",
											active && "bg-surface px-3",
										)}
										onClick={() => setSelectedId(item.id)}
										aria-pressed={active}
									>
										<span className="font-sans text-lg font-semibold text-fg">
											{item.name}
										</span>
										<span className="font-sans text-sm font-medium text-fg">
											{item.sector} · {item.district} · {item.province}
											{item.distanceKm === null
												? ""
												: ` · ${t("directoryKm", { count: String(item.distanceKm) })}`}
										</span>
									</button>
								</li>
							);
						})}
					</ul>
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
