import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTabs } from "@/components/ui/page-tabs";
import { RecordTable } from "@/components/ui/record-table";
import { isApiClientError, useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { useOnline } from "@/lib/offline/use-online";

type DeviceKind = "computer" | "tablet" | "router";
type DeviceCondition = "good" | "worn" | "broken";
type DeviceAvailability = "available" | "in_use" | "unavailable";

type DeviceCenter = { id: string; name: string };

type CenterDevice = {
	id: string;
	centerName: string;
	kind: DeviceKind;
	label: string;
	condition: DeviceCondition;
	availability: DeviceAvailability;
};

const KINDS: DeviceKind[] = ["computer", "tablet", "router"];
const CONDITIONS: DeviceCondition[] = ["good", "worn", "broken"];
const AVAILABILITY: DeviceAvailability[] = [
	"available",
	"in_use",
	"unavailable",
];

function kindKey(kind: DeviceKind): MessageKey {
	switch (kind) {
		case "computer":
			return "deviceComputer";
		case "tablet":
			return "deviceTablet";
		case "router":
			return "deviceRouter";
		default: {
			const unreachable: never = kind;
			return unreachable;
		}
	}
}

function conditionKey(condition: DeviceCondition): MessageKey {
	switch (condition) {
		case "good":
			return "deviceGood";
		case "worn":
			return "deviceWorn";
		case "broken":
			return "deviceBroken";
		default: {
			const unreachable: never = condition;
			return unreachable;
		}
	}
}

function availabilityKey(availability: DeviceAvailability): MessageKey {
	switch (availability) {
		case "available":
			return "deviceAvailable";
		case "in_use":
			return "deviceInUse";
		case "unavailable":
			return "deviceUnavailable";
		default: {
			const unreachable: never = availability;
			return unreachable;
		}
	}
}

function saveError(caught: unknown): MessageKey {
	if (!isApiClientError(caught)) return "tryAgain";
	const details = caught.details;
	const reason =
		details && typeof details === "object" && "reason" in details
			? details.reason
			: undefined;
	if (reason === "label") return "deviceLabelInvalid";
	return "tryAgain";
}

export default function DevicesPage() {
	const { t } = useI18n();
	const online = useOnline();
	const list = useEngine("/devices", { query: {} });
	const create = useEngineMutation("/devices/create");
	const [centerId, setCenterId] = useState("");
	const [kind, setKind] = useState<DeviceKind>("computer");
	const [label, setLabel] = useState("");
	const [condition, setCondition] = useState<DeviceCondition>("good");
	const [availability, setAvailability] =
		useState<DeviceAvailability>("available");
	const [error, setError] = useState<MessageKey | null>(null);
	const [panel, setPanel] = useState<"list" | "add">("list");
	const centers = (list.data?.centers ?? []) as DeviceCenter[];

	useEffect(() => {
		const first = centers[0];
		if (!centerId && first) setCenterId(first.id);
	}, [centerId, centers]);

	async function onSave(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		if (!online) {
			setError("practiceOffline");
			return;
		}
		if (!label.trim()) {
			setError("deviceLabelInvalid");
			return;
		}
		if (!centerId) {
			setError("tryAgain");
			return;
		}
		try {
			await create.mutateAsync({
				body: {
					centerId,
					kind,
					label: label.trim(),
					condition,
					availability,
				},
			});
			setLabel("");
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
				{t("homeUnavailable")}
			</p>
		);
	}
	if (list.error || !list.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const items = (list.data.items ?? []) as CenterDevice[];
	const canCreate = list.data.canCreate === true;
	const canSave = label.trim() !== "" && centerId !== "";

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<div>
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{t("devicesTitle")}
				</h1>
				<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
					{t("devicesSentence")}
				</p>
			</div>
			{canCreate ? (
				<PageTabs
					label={t("devicesTitle")}
					value={panel}
					onChange={setPanel}
					tabs={[
						{ value: "list", label: t("listTab") },
						{ value: "add", label: t("addTab") },
					]}
				/>
			) : null}
			{canCreate && panel === "add" ? (
				<form
					className="flex flex-col gap-4"
					onSubmit={(event) => void onSave(event)}
				>
					{centers.length > 1 ? (
						<label className="flex flex-col gap-2" htmlFor="device-center">
							<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
								{t("sessionCenter")}
							</span>
							<select
								id="device-center"
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
					) : null}
					<label className="flex flex-col gap-2" htmlFor="device-label">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("deviceLabel")}
						</span>
						<input
							id="device-label"
							className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
							value={label}
							maxLength={80}
							onChange={(event) => setLabel(event.target.value)}
						/>
					</label>
					<label className="flex flex-col gap-2" htmlFor="device-kind">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("deviceKind")}
						</span>
						<select
							id="device-kind"
							className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
							value={kind}
							onChange={(event) => setKind(event.target.value as DeviceKind)}
						>
							{KINDS.map((item) => (
								<option key={item} value={item}>
									{t(kindKey(item))}
								</option>
							))}
						</select>
					</label>
					<div className="grid gap-4 sm:grid-cols-2">
						<label className="flex flex-col gap-2" htmlFor="device-condition">
							<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
								{t("deviceCondition")}
							</span>
							<select
								id="device-condition"
								className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
								value={condition}
								onChange={(event) =>
									setCondition(event.target.value as DeviceCondition)
								}
							>
								{CONDITIONS.map((item) => (
									<option key={item} value={item}>
										{t(conditionKey(item))}
									</option>
								))}
							</select>
						</label>
						<label
							className="flex flex-col gap-2"
							htmlFor="device-availability"
						>
							<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
								{t("deviceAvailability")}
							</span>
							<select
								id="device-availability"
								className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
								value={availability}
								onChange={(event) =>
									setAvailability(event.target.value as DeviceAvailability)
								}
							>
								{AVAILABILITY.map((item) => (
									<option key={item} value={item}>
										{t(availabilityKey(item))}
									</option>
								))}
							</select>
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
					{canSave ? (
						<Button
							type="submit"
							variant="sticker"
							className="w-fit"
							disabled={create.isPending}
						>
							{t("deviceSave")}
						</Button>
					) : null}
				</form>
			) : null}
			{panel === "list" || !canCreate ? (
				items.length === 0 ? (
					<EmptyState sentence={t("devicesEmpty")} />
				) : (
					<RecordTable
						caption={t("devicesTitle")}
						columns={[
							t("centerLabel"),
							t("nameLabel"),
							t("deviceKind"),
							t("deviceCondition"),
							t("deviceAvailability"),
							t("openRow"),
						]}
						rows={items.map((item) => ({
							key: item.id,
							cells: [
								item.centerName,
								item.label,
								t(kindKey(item.kind)),
								<Badge
									key="condition"
									variant={item.condition === "broken" ? "danger" : "neutral"}
								>
									{t(conditionKey(item.condition))}
								</Badge>,
								<Badge
									key="free"
									variant={
										item.availability === "available" ? "pending" : "neutral"
									}
								>
									{t(availabilityKey(item.availability))}
								</Badge>,
								<Link
									key="open"
									to={`/devices/${item.id}`}
									className="underline"
								>
									{t("openRow")}
								</Link>,
							],
						}))}
					/>
				)
			) : null}
		</section>
	);
}
