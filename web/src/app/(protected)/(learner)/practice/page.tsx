import { type FormEvent, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { isApiClientError, useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { useOnline } from "@/lib/offline/use-online";

type DeviceKind = "computer" | "tablet" | "router";

type PracticeDevice = {
	id: string;
	centerName: string;
	kind: DeviceKind;
	label: string;
};

type PracticeBooking = {
	id: string;
	label: string;
	kind: DeviceKind;
	startsAt: string;
	minutes: number;
};

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

function bookError(caught: unknown): MessageKey {
	if (!isApiClientError(caught)) return "tryAgain";
	const details = caught.details;
	const reason =
		details && typeof details === "object" && "reason" in details
			? details.reason
			: undefined;
	switch (reason) {
		case "overlap":
			return "practiceOverlap";
		case "device":
			return "practiceNotFree";
		case "time":
			return "practiceTimeInvalid";
		case "minutes":
			return "practiceMinutesInvalid";
		default:
			if (caught.status === 404) return "deviceMissing";
			return "tryAgain";
	}
}

function when(locale: "rw" | "en", value: string): string {
	return new Date(value).toLocaleString(locale === "rw" ? "rw-RW" : "en-GB", {
		dateStyle: "medium",
		timeStyle: "short",
	});
}

export default function PracticePage() {
	const { locale, t } = useI18n();
	const online = useOnline();
	const practice = useEngine("/practice");
	const book = useEngineMutation("/practice/book");
	const [deviceId, setDeviceId] = useState("");
	const [startsAt, setStartsAt] = useState("");
	const [minutes, setMinutes] = useState("60");
	const [error, setError] = useState<MessageKey | null>(null);
	const bookingId = useRef(crypto.randomUUID());

	async function onBook(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		if (!online) {
			setError("practiceOffline");
			return;
		}
		const parsed = Number(minutes);
		if (!deviceId || !startsAt) {
			setError("practiceTimeInvalid");
			return;
		}
		if (!Number.isInteger(parsed) || parsed < 30 || parsed > 180) {
			setError("practiceMinutesInvalid");
			return;
		}
		try {
			await book.mutateAsync({
				body: {
					deviceId,
					bookingId: bookingId.current,
					startsAt: new Date(startsAt).toISOString(),
					minutes: parsed,
				},
			});
			bookingId.current = crypto.randomUUID();
			setStartsAt("");
			await practice.invalidate();
		} catch (caught) {
			setError(bookError(caught));
		}
	}

	if (practice.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(practice.error) && practice.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("homeUnavailable")}
			</p>
		);
	}
	if (practice.error || !practice.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const items = (practice.data.items ?? []) as PracticeDevice[];
	const bookings = (practice.data.bookings ?? []) as PracticeBooking[];
	const selected = deviceId || items[0]?.id || "";

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<div>
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{t("practiceTitle")}
				</h1>
				<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
					{t("practiceSentence")}
				</p>
			</div>
			{items.length === 0 ? (
				<EmptyState sentence={t("practiceEmpty")} />
			) : (
				<form
					className="flex flex-col gap-4"
					onSubmit={(event) => void onBook(event)}
				>
					<fieldset className="flex flex-col gap-3">
						<legend className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("devicesTitle")}
						</legend>
						{items.map((item) => (
							<label
								key={item.id}
								className="flex items-center gap-3 font-sans text-lg text-fg"
							>
								<input
									type="radio"
									name="device"
									value={item.id}
									checked={selected === item.id}
									onChange={() => setDeviceId(item.id)}
								/>
								<span>
									{item.label}
									<span className="mt-1 block font-meta text-xs font-semibold uppercase tracking-wide">
										{t(kindKey(item.kind))} · {item.centerName}
									</span>
								</span>
							</label>
						))}
					</fieldset>
					<label className="flex flex-col gap-2" htmlFor="practice-when">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("sessionWhen")}
						</span>
						<input
							id="practice-when"
							type="datetime-local"
							className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
							value={startsAt}
							onChange={(event) => setStartsAt(event.target.value)}
						/>
					</label>
					<label className="flex flex-col gap-2" htmlFor="practice-minutes">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("sessionMinutes")}
						</span>
						<input
							id="practice-minutes"
							inputMode="numeric"
							className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
							value={minutes}
							onChange={(event) => setMinutes(event.target.value)}
						/>
					</label>
					{error ? (
						<p
							className="font-sans text-sm font-medium text-danger"
							role="alert"
						>
							{t(error)}
						</p>
					) : null}
					<Button
						type="submit"
						variant="sticker"
						className="w-fit"
						disabled={book.isPending}
					>
						{t("practiceBook")}
					</Button>
				</form>
			)}
			{bookings.length > 0 ? (
				<div>
					<h2 className="font-sans text-2xl font-semibold text-fg">
						{t("practiceBooked")}
					</h2>
					<ul>
						{bookings.map((item) => (
							<li
								key={item.id}
								className="flex flex-col gap-2 border-t border-ink/15 py-4"
							>
								<Badge variant="pending">{t(kindKey(item.kind))}</Badge>
								<p className="font-sans text-lg text-fg">{item.label}</p>
								<p className="font-sans text-sm text-fg">
									{when(locale, item.startsAt)}
								</p>
							</li>
						))}
					</ul>
				</div>
			) : null}
		</section>
	);
}
