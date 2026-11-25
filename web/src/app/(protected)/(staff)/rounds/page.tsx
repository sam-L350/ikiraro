import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router";
import { RoundMark } from "@/components/learning/round-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTabs } from "@/components/ui/page-tabs";
import { isApiClientError, useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { useOnline } from "@/lib/offline/use-online";

type RoundDistrict = { id: string; name: string };

type AllocationRound = {
	id: string;
	title: string;
	quantity: number;
	districtName: string;
	opensAt: string;
	closesAt: string;
	open: boolean;
};

function optionalCount(value: string): number | null {
	const text = value.trim();
	if (text === "") return null;
	const parsed = Number(text);
	if (!Number.isInteger(parsed) || parsed < 0) return null;
	return parsed;
}

function toIso(value: string): string | null {
	if (!value) return null;
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return null;
	return parsed.toISOString();
}

const fieldClass =
	"h-11 rounded-xl border border-line-strong bg-canvas px-3 font-sans text-lg text-fg";

function when(value: string, locale: "en" | "rw"): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleDateString(locale === "rw" ? "rw-RW" : "en-GB", {
		day: "numeric",
		month: "short",
		year: "numeric",
		timeZone: "Africa/Kigali",
	});
}

export default function RoundsPage() {
	const { locale, t } = useI18n();
	const online = useOnline();
	const list = useEngine("/rounds");
	const create = useEngineMutation("/rounds/create");
	const [districtId, setDistrictId] = useState("");
	const [title, setTitle] = useState("");
	const [quantity, setQuantity] = useState("");
	const [opensAt, setOpensAt] = useState("");
	const [closesAt, setClosesAt] = useState("");
	const [points, setPoints] = useState("");
	const [badges, setBadges] = useState("");
	const [months, setMonths] = useState("");
	const [error, setError] = useState<MessageKey | null>(null);
	const [panel, setPanel] = useState<"list" | "add">("list");
	const [filterDistrict, setFilterDistrict] = useState("");
	const districts = (list.data?.districts ?? []) as RoundDistrict[];

	useEffect(() => {
		const first = districts[0];
		if (!districtId && first) setDistrictId(first.id);
	}, [districtId, districts]);

	async function onSave(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		const opens = toIso(opensAt);
		const closes = toIso(closesAt);
		const items = optionalCount(quantity);
		if (
			!online ||
			!districtId ||
			!title.trim() ||
			items === null ||
			items < 1 ||
			!opens ||
			!closes
		) {
			setError("tryAgain");
			return;
		}
		const criteria: {
			kind: "points" | "badges" | "months_active";
			minimum: number;
		}[] = [];
		const pointRule = optionalCount(points);
		const badgeRule = optionalCount(badges);
		const monthRule = optionalCount(months);
		if (points.trim() !== "" && pointRule === null) {
			setError("tryAgain");
			return;
		}
		if (badges.trim() !== "" && badgeRule === null) {
			setError("tryAgain");
			return;
		}
		if (months.trim() !== "" && monthRule === null) {
			setError("tryAgain");
			return;
		}
		if (pointRule !== null)
			criteria.push({ kind: "points", minimum: pointRule });
		if (badgeRule !== null)
			criteria.push({ kind: "badges", minimum: badgeRule });
		if (monthRule !== null) {
			criteria.push({ kind: "months_active", minimum: monthRule });
		}
		try {
			await create.mutateAsync({
				body: {
					districtId,
					title: title.trim(),
					quantity: items,
					opensAt: opens,
					closesAt: closes,
					criteria,
				},
			});
			setTitle("");
			setQuantity("");
			setOpensAt("");
			setClosesAt("");
			setPoints("");
			setBadges("");
			setMonths("");
			await list.invalidate();
		} catch {
			setError("tryAgain");
		}
	}

	if (list.isPending) {
		return <div className="h-40 animate-pulse rounded-[20px] bg-surface" />;
	}
	if (isApiClientError(list.error) && list.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("roundsDenied")}
			</p>
		);
	}
	if (list.error || !list.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const rounds = (list.data.rounds ?? []) as AllocationRound[];
	const districtName = districts.find(
		(item) => item.id === filterDistrict,
	)?.name;
	const shown = districtName
		? rounds.filter((round) => round.districtName === districtName)
		: rounds;

	return (
		<section className="mx-auto flex max-w-3xl flex-col gap-8">
			<article className="rounded-[20px] bg-surface p-6 sm:p-8">
				<div className="flex items-start gap-4">
					<RoundMark />
					<div>
						<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
							{t("roundsTitle")}
						</h1>
						<p className="mt-2 max-w-xl font-sans text-lg font-medium text-fg">
							{t("roundsSentence")}
						</p>
					</div>
				</div>
			</article>
			<PageTabs
				label={t("roundsTitle")}
				value={panel}
				onChange={setPanel}
				tabs={[
					{ value: "list", label: t("listTab") },
					{ value: "add", label: t("addTab") },
				]}
			/>
			{panel === "add" ? (
				<form
					className="flex flex-col gap-4 rounded-[20px] bg-surface p-6"
					onSubmit={(event) => void onSave(event)}
				>
					<label className="flex flex-col gap-2" htmlFor="round-district">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("roundsDistrict")}
						</span>
						<select
							id="round-district"
							className={fieldClass}
							value={districtId}
							onChange={(event) => setDistrictId(event.target.value)}
						>
							{districts.map((district) => (
								<option key={district.id} value={district.id}>
									{district.name}
								</option>
							))}
						</select>
					</label>
					<label className="flex flex-col gap-2" htmlFor="round-title">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("roundsName")}
						</span>
						<input
							id="round-title"
							className={fieldClass}
							value={title}
							maxLength={120}
							onChange={(event) => setTitle(event.target.value)}
						/>
					</label>
					<label className="flex flex-col gap-2" htmlFor="round-quantity">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("roundsQuantity")}
						</span>
						<input
							id="round-quantity"
							inputMode="numeric"
							className={fieldClass}
							value={quantity}
							onChange={(event) => setQuantity(event.target.value)}
						/>
					</label>
					<div className="grid gap-4 sm:grid-cols-2">
						<label className="flex flex-col gap-2" htmlFor="round-opens">
							<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
								{t("roundsOpens")}
							</span>
							<input
								id="round-opens"
								type="datetime-local"
								className={fieldClass}
								value={opensAt}
								onChange={(event) => setOpensAt(event.target.value)}
							/>
						</label>
						<label className="flex flex-col gap-2" htmlFor="round-closes">
							<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
								{t("roundsCloses")}
							</span>
							<input
								id="round-closes"
								type="datetime-local"
								className={fieldClass}
								value={closesAt}
								onChange={(event) => setClosesAt(event.target.value)}
							/>
						</label>
					</div>
					<div className="grid gap-4 sm:grid-cols-3">
						<label className="flex flex-col gap-2" htmlFor="round-points">
							<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
								{t("inventoryPoints")}
							</span>
							<input
								id="round-points"
								inputMode="numeric"
								className={fieldClass}
								value={points}
								onChange={(event) => setPoints(event.target.value)}
							/>
						</label>
						<label className="flex flex-col gap-2" htmlFor="round-badges">
							<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
								{t("inventoryBadges")}
							</span>
							<input
								id="round-badges"
								inputMode="numeric"
								className={fieldClass}
								value={badges}
								onChange={(event) => setBadges(event.target.value)}
							/>
						</label>
						<label className="flex flex-col gap-2" htmlFor="round-months">
							<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
								{t("inventoryMonths")}
							</span>
							<input
								id="round-months"
								inputMode="numeric"
								className={fieldClass}
								value={months}
								onChange={(event) => setMonths(event.target.value)}
							/>
						</label>
					</div>
					{error ? (
						<p
							className="font-sans text-sm font-medium text-danger"
							role="alert"
						>
							{t(error)}
						</p>
					) : null}
					{districtId &&
					title.trim() &&
					quantity.trim() &&
					opensAt &&
					closesAt ? (
						<Button
							type="submit"
							variant="sticker"
							className="w-fit"
							disabled={create.isPending}
						>
							{t("roundsSave")}
						</Button>
					) : null}
				</form>
			) : (
				<>
					<label
						className="flex max-w-xs flex-col gap-2"
						htmlFor="round-filter"
					>
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("roundsDistrict")}
						</span>
						<select
							id="round-filter"
							className={fieldClass}
							value={filterDistrict}
							onChange={(event) => setFilterDistrict(event.target.value)}
						>
							<option value="">{t("roundsDistrict")}</option>
							{districts.map((district) => (
								<option key={district.id} value={district.id}>
									{district.name}
								</option>
							))}
						</select>
					</label>
					{shown.length === 0 ? (
						<EmptyState sentence={t("roundsEmpty")} />
					) : (
						<ul className="flex flex-col gap-3">
							{shown.map((round) => (
								<li key={round.id}>
									<Link
										to={`/rounds/${round.id}`}
										className="flex flex-col gap-2 rounded-[20px] bg-surface px-5 py-4"
									>
										<div className="flex flex-wrap items-center justify-between gap-3">
											<span className="font-sans text-xl font-semibold text-fg">
												{round.title}
											</span>
											<Badge variant={round.open ? "pending" : "neutral"}>
												{round.open ? t("roundsOpen") : t("roundsClosed")}
											</Badge>
										</div>
										<p className="font-sans text-base font-medium text-fg">
											{round.districtName}
											{" · "}
											{t("allocationItems", { count: String(round.quantity) })}
										</p>
										<p className="font-meta text-xs font-semibold uppercase tracking-wide text-fg-muted">
											{when(round.opensAt, locale)}
											{" – "}
											{when(round.closesAt, locale)}
										</p>
									</Link>
								</li>
							))}
						</ul>
					)}
				</>
			)}
		</section>
	);
}
