import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isApiClientError, useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { useOnline } from "@/lib/offline/use-online";

type InventoryCondition = "good" | "worn" | "damaged";
type InventoryStatus =
	| "in_stock"
	| "reserved"
	| "awarded"
	| "in_repair"
	| "lost"
	| "retired";

type InventoryCenter = { id: string; name: string };

type InventoryRow = {
	id: string;
	name: string;
	category: string;
	serial: string;
	status: InventoryStatus;
	centerName: string;
};

const CONDITIONS: InventoryCondition[] = ["good", "worn", "damaged"];

function conditionKey(condition: InventoryCondition): MessageKey {
	switch (condition) {
		case "good":
			return "inventoryGood";
		case "worn":
			return "inventoryWorn";
		case "damaged":
			return "inventoryDamaged";
		default: {
			const unreachable: never = condition;
			return unreachable;
		}
	}
}

function statusKey(status: InventoryStatus): MessageKey {
	switch (status) {
		case "in_stock":
			return "inventoryInStock";
		case "reserved":
			return "inventoryReserved";
		case "awarded":
			return "inventoryAwarded";
		case "in_repair":
			return "inventoryInRepair";
		case "lost":
			return "inventoryLost";
		case "retired":
			return "inventoryRetired";
		default: {
			const unreachable: never = status;
			return unreachable;
		}
	}
}

function statusTone(status: InventoryStatus): "neutral" | "pending" | "danger" {
	switch (status) {
		case "in_stock":
		case "awarded":
		case "retired":
			return "neutral";
		case "reserved":
		case "in_repair":
			return "pending";
		case "lost":
			return "danger";
		default: {
			const unreachable: never = status;
			return unreachable;
		}
	}
}

function isCondition(value: string): value is InventoryCondition {
	switch (value) {
		case "good":
		case "worn":
		case "damaged":
			return true;
		default:
			return false;
	}
}

function isStatus(value: string): value is InventoryStatus {
	switch (value) {
		case "in_stock":
		case "reserved":
		case "awarded":
		case "in_repair":
		case "lost":
		case "retired":
			return true;
		default:
			return false;
	}
}

function optionalCount(value: string): number | null {
	const text = value.trim();
	if (text === "") return null;
	const parsed = Number(text);
	if (!Number.isInteger(parsed) || parsed < 0) return null;
	return parsed;
}

function saveError(caught: unknown): MessageKey {
	if (!isApiClientError(caught)) return "tryAgain";
	const details = caught.details;
	const reason =
		details && typeof details === "object" && "reason" in details
			? details.reason
			: undefined;
	if (reason === "criteria") return "inventoryDenied";
	return "tryAgain";
}

export default function InventoryPage() {
	const { t } = useI18n();
	const online = useOnline();
	const list = useEngine("/inventory", { query: {} });
	const create = useEngineMutation("/inventory/create");
	const [centerId, setCenterId] = useState("");
	const [name, setName] = useState("");
	const [category, setCategory] = useState("");
	const [serial, setSerial] = useState("");
	const [condition, setCondition] = useState<InventoryCondition>("good");
	const [donor, setDonor] = useState("");
	const [acquiredOn, setAcquiredOn] = useState("");
	const [points, setPoints] = useState("");
	const [badges, setBadges] = useState("");
	const [months, setMonths] = useState("");
	const [error, setError] = useState<MessageKey | null>(null);
	const centers = (list.data?.centers ?? []) as InventoryCenter[];

	useEffect(() => {
		const first = centers[0];
		if (!centerId && first) setCenterId(first.id);
	}, [centerId, centers]);

	async function onSave(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		if (
			!online ||
			!centerId ||
			!name.trim() ||
			!category.trim() ||
			!serial.trim()
		) {
			setError("tryAgain");
			return;
		}
		if (!/^\d{4}-\d{2}-\d{2}$/.test(acquiredOn)) {
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
					name: name.trim(),
					category: category.trim(),
					serial: serial.trim(),
					condition,
					centerId,
					donor: donor.trim() || undefined,
					acquiredOn,
					criteria,
				},
			});
			setName("");
			setCategory("");
			setSerial("");
			setDonor("");
			setAcquiredOn("");
			setPoints("");
			setBadges("");
			setMonths("");
			await list.invalidate();
		} catch (caught) {
			setError(saveError(caught));
		}
	}

	if (list.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(list.error) && list.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("inventoryDenied")}
			</p>
		);
	}
	if (list.error || !list.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const items = ((list.data.items ?? []) as InventoryRow[]).filter((item) =>
		isStatus(item.status),
	);

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<div>
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{t("inventoryTitle")}
				</h1>
				<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
					{t("inventorySentence")}
				</p>
			</div>
			<form
				className="flex flex-col gap-4"
				onSubmit={(event) => void onSave(event)}
			>
				<label className="flex flex-col gap-2" htmlFor="inventory-center">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("inventoryCenter")}
					</span>
					<select
						id="inventory-center"
						className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
						value={centerId}
						onChange={(event) => setCenterId(event.target.value)}
					>
						{centers.map((center) => (
							<option key={center.id} value={center.id}>
								{center.name}
							</option>
						))}
					</select>
				</label>
				<label className="flex flex-col gap-2" htmlFor="inventory-name">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("inventoryName")}
					</span>
					<input
						id="inventory-name"
						className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
						value={name}
						maxLength={120}
						onChange={(event) => setName(event.target.value)}
					/>
				</label>
				<div className="grid gap-4 sm:grid-cols-2">
					<label className="flex flex-col gap-2" htmlFor="inventory-category">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("inventoryCategory")}
						</span>
						<input
							id="inventory-category"
							className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
							value={category}
							maxLength={60}
							onChange={(event) => setCategory(event.target.value)}
						/>
					</label>
					<label className="flex flex-col gap-2" htmlFor="inventory-serial">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("inventorySerial")}
						</span>
						<input
							id="inventory-serial"
							className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
							value={serial}
							maxLength={80}
							onChange={(event) => setSerial(event.target.value)}
						/>
					</label>
				</div>
				<label className="flex flex-col gap-2" htmlFor="inventory-condition">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("inventoryCondition")}
					</span>
					<select
						id="inventory-condition"
						className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
						value={condition}
						onChange={(event) => {
							if (isCondition(event.target.value))
								setCondition(event.target.value);
						}}
					>
						{CONDITIONS.map((item) => (
							<option key={item} value={item}>
								{t(conditionKey(item))}
							</option>
						))}
					</select>
				</label>
				<div className="grid gap-4 sm:grid-cols-2">
					<label className="flex flex-col gap-2" htmlFor="inventory-donor">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("inventoryDonor")}
						</span>
						<input
							id="inventory-donor"
							className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
							value={donor}
							maxLength={120}
							onChange={(event) => setDonor(event.target.value)}
						/>
					</label>
					<label className="flex flex-col gap-2" htmlFor="inventory-acquired">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("inventoryAcquired")}
						</span>
						<input
							id="inventory-acquired"
							type="date"
							className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
							value={acquiredOn}
							onChange={(event) => setAcquiredOn(event.target.value)}
						/>
					</label>
				</div>
				<div className="grid gap-4 sm:grid-cols-3">
					<label className="flex flex-col gap-2" htmlFor="inventory-points">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("inventoryPoints")}
						</span>
						<input
							id="inventory-points"
							inputMode="numeric"
							className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
							value={points}
							onChange={(event) => setPoints(event.target.value)}
						/>
					</label>
					<label className="flex flex-col gap-2" htmlFor="inventory-badges">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("inventoryBadges")}
						</span>
						<input
							id="inventory-badges"
							inputMode="numeric"
							className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
							value={badges}
							onChange={(event) => setBadges(event.target.value)}
						/>
					</label>
					<label className="flex flex-col gap-2" htmlFor="inventory-months">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("inventoryMonths")}
						</span>
						<input
							id="inventory-months"
							inputMode="numeric"
							className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
							value={months}
							onChange={(event) => setMonths(event.target.value)}
						/>
					</label>
				</div>
				{error ? (
					<p className="font-sans text-sm font-medium text-danger" role="alert">
						{t(error)}
					</p>
				) : null}
				<Button
					type="submit"
					variant="sticker"
					className="w-fit"
					disabled={create.isPending || !centerId}
				>
					{t("inventorySave")}
				</Button>
			</form>
			{items.length === 0 ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("inventoryEmpty")}
				</p>
			) : (
				<ul>
					{items.map((item) => (
						<li key={item.id} className="border-t border-ink/15 py-4">
							<Link
								to={`/inventory/${item.id}`}
								className="flex flex-col gap-2"
							>
								<Badge variant={statusTone(item.status)}>
									{t(statusKey(item.status))}
								</Badge>
								<p className="font-sans text-lg font-medium text-fg">
									{item.name}
								</p>
								<p className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
									{item.category} · {item.serial} · {item.centerName}
								</p>
							</Link>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
