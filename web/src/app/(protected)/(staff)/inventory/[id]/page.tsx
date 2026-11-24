import { type FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	invalidateEngine,
	isApiClientError,
	useEngine,
	useEngineMutation,
} from "@/lib/engine";
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

type Criterion =
	| { kind: "points"; minimum: number }
	| { kind: "badges"; minimum?: number; badgeId?: string }
	| { kind: "hours"; minimum: number }
	| { kind: "attendance"; minimum: number }
	| { kind: "district"; districtId: string }
	| { kind: "months_active"; minimum: number };

type InventoryCenter = { id: string; name: string };

type HistoryRow = {
	id: string;
	status: InventoryStatus;
	centerName: string;
	holderName: string | null;
	note: string | null;
};

type InventoryDetail = {
	id: string;
	name: string;
	category: string;
	serial: string;
	condition: InventoryCondition;
	status: InventoryStatus;
	centerId: string;
	centerName: string;
	donor: string | null;
	criteria: Criterion[];
	history: HistoryRow[];
	centers: InventoryCenter[];
};

const CONDITIONS: InventoryCondition[] = ["good", "worn", "damaged"];
const STATUSES: InventoryStatus[] = [
	"in_stock",
	"reserved",
	"awarded",
	"in_repair",
	"lost",
	"retired",
];

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

function ruleSentence(
	rule: Criterion,
	t: (key: MessageKey, vars?: Record<string, string>) => string,
): string {
	switch (rule.kind) {
		case "points":
			return t("inventoryPointsRule", { count: String(rule.minimum) });
		case "badges":
			if (rule.minimum !== undefined) {
				return t("inventoryBadgesRule", { count: String(rule.minimum) });
			}
			return t("inventoryBadgeOne");
		case "hours":
			return t("inventoryHoursRule", { count: String(rule.minimum) });
		case "attendance":
			return t("inventoryAttendanceRule", { count: String(rule.minimum) });
		case "months_active":
			return t("inventoryMonthsRule", { count: String(rule.minimum) });
		case "district":
			return t("inventoryDistrictRule");
		default: {
			const unreachable: never = rule;
			return unreachable;
		}
	}
}

export default function InventoryItemPage() {
	const { t } = useI18n();
	const online = useOnline();
	const { id = "" } = useParams();
	const item = useEngine(
		"/inventory/:id",
		{ query: { id } },
		{ enabled: Boolean(id) },
	);
	const update = useEngineMutation("/inventory/:id/update");
	const [status, setStatus] = useState<InventoryStatus>("in_stock");
	const [condition, setCondition] = useState<InventoryCondition>("good");
	const [centerId, setCenterId] = useState("");
	const [note, setNote] = useState("");
	const [ready, setReady] = useState(false);
	const [error, setError] = useState<MessageKey | null>(null);
	const detail = item.data as InventoryDetail | undefined;

	useEffect(() => {
		if (!detail || ready) return;
		if (isStatus(detail.status)) setStatus(detail.status);
		if (isCondition(detail.condition)) setCondition(detail.condition);
		setCenterId(detail.centerId);
		setReady(true);
	}, [detail, ready]);

	async function onSave(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		if (!online || !detail || !centerId) {
			setError("tryAgain");
			return;
		}
		try {
			await update.mutateAsync({
				body: {
					id: detail.id,
					condition,
					status,
					centerId,
					donor: detail.donor ?? undefined,
					note: note.trim() || undefined,
					criteria: detail.criteria,
				},
			});
			setNote("");
			await item.invalidate();
		} catch {
			setError("tryAgain");
		}
	}

	if (!id || item.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(item.error) && item.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("inventoryDenied")}
			</p>
		);
	}
	if (item.error || !detail) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("inventoryMissing")}
			</p>
		);
	}

	const rules = detail.criteria.map((rule) => ruleSentence(rule, t));

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<div>
				<Link
					to="/inventory"
					className="font-sans text-sm font-semibold text-fg"
				>
					{t("inventoryTitle")}
				</Link>
				<h1 className="mt-3 font-sans text-4xl font-semibold text-balance text-fg">
					{detail.name}
				</h1>
				<p className="mt-4 font-sans text-lg font-medium text-fg">
					{detail.category} · {detail.serial} · {detail.centerName}
				</p>
			</div>
			<div className="flex flex-col gap-2">
				<h2 className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
					{t("inventoryRules")}
				</h2>
				{rules.length === 0 ? (
					<p className="font-sans text-lg font-medium text-fg">
						{t("inventoryNoRules")}
					</p>
				) : (
					<ul className="flex flex-col gap-1">
						{rules.map((rule) => (
							<li key={rule} className="font-sans text-lg font-medium text-fg">
								{rule}
							</li>
						))}
					</ul>
				)}
			</div>
			<form
				className="flex flex-col gap-4"
				onSubmit={(event) => void onSave(event)}
			>
				<label className="flex flex-col gap-2" htmlFor="inventory-status">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("inventoryStatus")}
					</span>
					<select
						id="inventory-status"
						className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
						value={status}
						onChange={(event) => {
							if (isStatus(event.target.value)) setStatus(event.target.value);
						}}
					>
						{STATUSES.map((item) => (
							<option key={item} value={item}>
								{t(statusKey(item))}
							</option>
						))}
					</select>
				</label>
				<label
					className="flex flex-col gap-2"
					htmlFor="inventory-item-condition"
				>
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("inventoryCondition")}
					</span>
					<select
						id="inventory-item-condition"
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
				<label className="flex flex-col gap-2" htmlFor="inventory-holding">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("inventoryCenter")}
					</span>
					<select
						id="inventory-holding"
						className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
						value={centerId}
						onChange={(event) => setCenterId(event.target.value)}
					>
						{detail.centers.map((center) => (
							<option key={center.id} value={center.id}>
								{center.name}
							</option>
						))}
					</select>
				</label>
				<label className="flex flex-col gap-2" htmlFor="inventory-note">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("inventoryNote")}
					</span>
					<input
						id="inventory-note"
						className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
						value={note}
						maxLength={200}
						onChange={(event) => setNote(event.target.value)}
					/>
				</label>
				{error ? (
					<p className="font-sans text-sm font-medium text-danger" role="alert">
						{t(error)}
					</p>
				) : null}
				<Button
					type="submit"
					variant="sticker"
					className="w-fit"
					disabled={update.isPending}
				>
					{t("inventoryUpdate")}
				</Button>
			</form>
			<div className="flex flex-col gap-3">
				<h2 className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
					{t("inventoryHistory")}
				</h2>
				<ul>
					{detail.history.map((entry) => (
						<li
							key={entry.id}
							className="flex flex-wrap items-center gap-3 border-t border-ink/15 py-4"
						>
							{isStatus(entry.status) ? (
								<Badge variant={statusTone(entry.status)}>
									{t(statusKey(entry.status))}
								</Badge>
							) : null}
							<p className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
								{entry.centerName}
								{entry.holderName ? ` · ${entry.holderName}` : ""}
								{entry.note ? ` · ${entry.note}` : ""}
							</p>
						</li>
					))}
				</ul>
			</div>
			<ItemCare inventoryId={detail.id} />
		</section>
	);
}

function ItemCare({ inventoryId }: { inventoryId: string }) {
	const { t } = useI18n();
	const care = useEngine("/item-care", { query: { inventoryId } });
	const repair = useEngineMutation("/item-care/repair");
	const warranty = useEngineMutation("/item-care/warranty");
	const [note, setNote] = useState("");
	const [endsOn, setEndsOn] = useState("");
	const [error, setError] = useState<MessageKey | null>(null);

	if (care.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(care.error) && care.error.status === 403) {
		return <p className="font-sans text-lg text-fg">{t("careDenied")}</p>;
	}

	async function onRepair(event: FormEvent) {
		event.preventDefault();
		if (!note.trim()) return;
		setError(null);
		try {
			await repair.mutateAsync({
				body: { inventoryId, note: note.trim() },
			});
			setNote("");
			await invalidateEngine("/item-care");
		} catch {
			setError("tryAgain");
		}
	}

	async function onWarranty(event: FormEvent) {
		event.preventDefault();
		if (!endsOn.trim()) return;
		setError(null);
		try {
			await warranty.mutateAsync({
				body: { inventoryId, endsOn: endsOn.trim() },
			});
			setEndsOn("");
			await invalidateEngine("/item-care");
		} catch {
			setError("tryAgain");
		}
	}

	const repairs = care.data?.repairs ?? [];
	return (
		<div className="flex flex-col gap-8">
			<section className="flex flex-col gap-3">
				<h2 className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
					{t("repairTitle")}
				</h2>
				{repairs.length === 0 ? (
					<p className="font-sans text-lg text-fg">{t("repairEmpty")}</p>
				) : (
					<ul>
						{repairs.map((row) => (
							<li
								key={row.id}
								className="border-t border-ink/15 py-3 font-sans text-lg text-fg"
							>
								{row.note}
							</li>
						))}
					</ul>
				)}
				<form
					className="flex flex-col gap-3"
					onSubmit={(event) => void onRepair(event)}
				>
					<label className="flex flex-col gap-2" htmlFor="repair-note">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("repairNote")}
						</span>
						<input
							id="repair-note"
							className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
							value={note}
							maxLength={500}
							onChange={(event) => setNote(event.target.value)}
						/>
					</label>
					{note.trim() ? (
						<Button type="submit" variant="quiet" className="w-fit">
							{t("repairSave")}
						</Button>
					) : null}
				</form>
			</section>
			<section className="flex flex-col gap-3">
				<h2 className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
					{t("warrantyTitle")}
				</h2>
				<p className="font-sans text-lg text-fg">
					{care.data?.warrantyEndsOn ?? t("warrantyNone")}
				</p>
				<form
					className="flex flex-col gap-3"
					onSubmit={(event) => void onWarranty(event)}
				>
					<label className="flex flex-col gap-2" htmlFor="warranty-ends">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("warrantyEnds")}
						</span>
						<input
							id="warranty-ends"
							type="date"
							className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
							value={endsOn}
							onChange={(event) => setEndsOn(event.target.value)}
						/>
					</label>
					{endsOn.trim() ? (
						<Button type="submit" variant="quiet" className="w-fit">
							{t("warrantySave")}
						</Button>
					) : null}
				</form>
			</section>
			{error ? (
				<p className="font-sans text-lg text-danger" role="alert">
					{t(error)}
				</p>
			) : null}
		</div>
	);
}
