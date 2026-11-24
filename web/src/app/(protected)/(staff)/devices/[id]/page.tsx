import { type FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isApiClientError, useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { useOnline } from "@/lib/offline/use-online";

type DeviceCondition = "good" | "worn" | "broken";
type DeviceAvailability = "available" | "in_use" | "unavailable";
type DeviceKind = "computer" | "tablet" | "router";

type CenterDevice = {
	id: string;
	centerName: string;
	kind: DeviceKind;
	label: string;
	condition: DeviceCondition;
	availability: DeviceAvailability;
};

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

function isCondition(value: string): value is DeviceCondition {
	switch (value) {
		case "good":
		case "worn":
		case "broken":
			return true;
		default:
			return false;
	}
}

function isAvailability(value: string): value is DeviceAvailability {
	switch (value) {
		case "available":
		case "in_use":
		case "unavailable":
			return true;
		default:
			return false;
	}
}

export default function DevicePage() {
	const { t } = useI18n();
	const online = useOnline();
	const { id = "" } = useParams();
	const device = useEngine(
		"/devices/:id",
		{ query: { id } },
		{ enabled: Boolean(id) },
	);
	const update = useEngineMutation("/devices/:id/update");
	const [condition, setCondition] = useState<DeviceCondition>("good");
	const [availability, setAvailability] =
		useState<DeviceAvailability>("available");
	const [ready, setReady] = useState(false);
	const [error, setError] = useState<MessageKey | null>(null);
	const detail = device.data as CenterDevice | undefined;

	useEffect(() => {
		if (!detail || ready) return;
		if (isCondition(detail.condition)) setCondition(detail.condition);
		if (isAvailability(detail.availability))
			setAvailability(detail.availability);
		setReady(true);
	}, [detail, ready]);

	async function onSave(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		if (!online) {
			setError("practiceOffline");
			return;
		}
		try {
			await update.mutateAsync({ body: { id, condition, availability } });
			await device.invalidate();
		} catch {
			setError("tryAgain");
		}
	}

	if (device.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(device.error) && device.error.status === 404) {
		return (
			<p className="font-sans text-lg font-medium text-fg">
				{t("deviceMissing")}
			</p>
		);
	}
	if (isApiClientError(device.error) && device.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("homeUnavailable")}
			</p>
		);
	}
	if (device.error || !detail) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<div>
				<Link to="/devices" className="font-sans text-sm font-semibold text-fg">
					{t("devicesTitle")}
				</Link>
				<h1 className="mt-4 font-sans text-4xl font-semibold text-balance text-fg">
					{detail.label}
				</h1>
				<p className="mt-4 font-meta text-xs font-semibold uppercase tracking-wide text-fg">
					{t(kindKey(detail.kind))} · {detail.centerName}
				</p>
				<div className="mt-4">
					<Badge variant={detail.condition === "broken" ? "danger" : "neutral"}>
						{t(conditionKey(detail.condition))}
					</Badge>
				</div>
			</div>
			<form
				className="flex flex-col gap-4"
				onSubmit={(event) => void onSave(event)}
			>
				<label className="flex flex-col gap-2" htmlFor="device-condition">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("deviceCondition")}
					</span>
					<select
						id="device-condition"
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
				<label className="flex flex-col gap-2" htmlFor="device-availability">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("deviceAvailability")}
					</span>
					<select
						id="device-availability"
						className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
						value={availability}
						onChange={(event) => {
							if (isAvailability(event.target.value)) {
								setAvailability(event.target.value);
							}
						}}
					>
						{AVAILABILITY.map((item) => (
							<option key={item} value={item}>
								{t(availabilityKey(item))}
							</option>
						))}
					</select>
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
					{t("deviceUpdate")}
				</Button>
			</form>
		</section>
	);
}
