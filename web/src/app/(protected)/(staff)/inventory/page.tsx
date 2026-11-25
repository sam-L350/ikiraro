import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router";
import { InventoryMark } from "@/components/learning/inventory-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTabs } from "@/components/ui/page-tabs";
import { useAuth } from "@/lib/auth";
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

function statusTone(
	status: InventoryStatus,
): "verified" | "pending" | "info" | "danger" | "outline" {
	switch (status) {
		case "in_stock":
			return "verified";
		case "reserved":
		case "in_repair":
			return "pending";
		case "awarded":
			return "info";
		case "lost":
			return "danger";
		case "retired":
			return "outline";
		default: {
			const unreachable: never = status;
			return unreachable;
		}
	}
}

const fieldClass =
	"h-11 rounded-xl border border-line-strong bg-canvas px-3 font-sans text-lg text-fg";

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
	const { user } = useAuth();
	const canManage =
		user?.roles.some((role) => role.code === "hardware_officer") ?? false;
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
	const [panel, setPanel] = useState<"list" | "add">("list");
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
		return <div className="h-40 animate-pulse rounded-[20px] bg-surface" />;
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

	const inStock = items.filter((item) => item.status === "in_stock").length;
	const reserved = items.filter((item) => item.status === "reserved").length;
	const awarded = items.filter((item) => item.status === "awarded").length;

	return (
		<section className="mx-auto flex max-w-3xl flex-col gap-8">
			<article className="rounded-[20px] bg-surface p-6 sm:p-8">
				<div className="flex items-start gap-4">
					<InventoryMark />
					<div>
						<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
							{t("inventoryTitle")}
						</h1>
						<p className="mt-2 max-w-xl font-sans text-lg font-medium text-fg">
							{t("inventorySentence")}
						</p>
					</div>
				</div>
				<ul className="mt-6 grid gap-3 sm:grid-cols-3">
					<Stat label={t("inventoryInStock")} value={String(inStock)} />
					<Stat label={t("inventoryReserved")} value={String(reserved)} />
					<Stat label={t("inventoryAwarded")} value={String(awarded)} />
				</ul>
			</article>
			{canManage ? (
				<PageTabs
					label={t("inventoryTitle")}
					value={panel}
					onChange={setPanel}
					tabs={[
						{ value: "list", label: t("listTab") },
						{ value: "add", label: t("addTab") },
					]}
				/>
			) : null}
			{canManage && panel === "add" ? (
				<form
					className="flex flex-col gap-4 rounded-[20px] bg-surface p-6"
					onSubmit={(event) => void onSave(event)}
				>
					<label className="flex flex-col gap-2" htmlFor="inventory-center">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("inventoryCenter")}
						</span>
						<select
							id="inventory-center"
							className={fieldClass}
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
							className={fieldClass}
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
								className={fieldClass}
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
								className={fieldClass}
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
							className={fieldClass}
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
								className={fieldClass}
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
								className={fieldClass}
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
								className={fieldClass}
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
								className={fieldClass}
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
					{name.trim() &&
					category.trim() &&
					serial.trim() &&
					centerId &&
					/^\d{4}-\d{2}-\d{2}$/.test(acquiredOn) ? (
						<Button
							type="submit"
							variant="sticker"
							className="w-fit"
							disabled={create.isPending}
						>
							{t("inventorySave")}
						</Button>
					) : null}
				</form>
			) : items.length === 0 ? (
				<EmptyState sentence={t("inventoryEmpty")} />
			) : (
				<ul className="flex flex-col gap-3">
					{items.map((item) => (
						<li key={item.id}>
							<Link
								to={`/inventory/${item.id}`}
								className="flex flex-col gap-2 rounded-[20px] bg-surface px-5 py-4"
							>
								<div className="flex flex-wrap items-center justify-between gap-3">
									<span className="font-sans text-xl font-semibold text-fg">
										{item.name}
									</span>
									<Badge variant={statusTone(item.status)}>
										{t(statusKey(item.status))}
									</Badge>
								</div>
								<p className="font-sans text-base font-medium text-fg">
									{item.category}
									{" · "}
									{item.serial}
								</p>
								<p className="font-meta text-xs font-semibold uppercase tracking-wide text-fg-muted">
									{item.centerName}
								</p>
							</Link>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<li className="rounded-2xl bg-canvas px-4 py-4">
			<p className="font-sans text-3xl font-semibold text-fg">{value}</p>
			<p className="mt-1 font-meta text-xs font-semibold uppercase tracking-wide text-fg-muted">
				{label}
			</p>
		</li>
	);
}
