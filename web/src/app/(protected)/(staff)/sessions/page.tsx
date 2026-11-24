import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTabs } from "@/components/ui/page-tabs";
import { RecordTable } from "@/components/ui/record-table";
import { useAuth } from "@/lib/auth";
import { isApiClientError, useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { useOnline } from "@/lib/offline/use-online";

type SessionCenter = { id: string; name: string };

type SessionItem = {
	id: string;
	topic: string;
	centerName: string;
	courseTitleRw: string | null;
	courseTitleEn: string | null;
	trainerName: string;
	startsAt: string;
	minutes: number;
	capacity: number;
	taken: number;
	open: boolean;
};

function courseTitle(
	locale: "rw" | "en",
	rw: string | null,
	en: string | null,
): string | null {
	if (locale === "rw" && rw?.trim()) return rw;
	if (en?.trim()) return en;
	return rw?.trim() || null;
}

function statusOf(item: SessionItem): {
	key: MessageKey;
	variant: "pending" | "neutral" | "danger";
} {
	if (item.taken >= item.capacity)
		return { key: "sessionFull", variant: "danger" };
	if (item.open) return { key: "sessionOpen", variant: "pending" };
	return { key: "sessionClosed", variant: "neutral" };
}

function saveError(caught: unknown): MessageKey {
	if (!isApiClientError(caught)) return "tryAgain";
	const details = caught.details;
	const reason =
		details && typeof details === "object" && "reason" in details
			? details.reason
			: undefined;
	switch (reason) {
		case "topic":
			return "sessionTopicInvalid";
		case "time":
			return "sessionTimeInvalid";
		case "minutes":
			return "sessionMinutesInvalid";
		case "capacity":
			return "sessionCapacityInvalid";
		case "trainer":
			return "sessionTrainerInvalid";
		default:
			return "tryAgain";
	}
}

export default function SessionsPage() {
	const { locale, t } = useI18n();
	const online = useOnline();
	const navigate = useNavigate();
	const { user } = useAuth();
	const list = useEngine("/center-sessions", { query: {} });
	const create = useEngineMutation("/center-sessions/create");
	const [centerId, setCenterId] = useState("");
	const [topic, setTopic] = useState("");
	const [startsAt, setStartsAt] = useState("");
	const [minutes, setMinutes] = useState("60");
	const [capacity, setCapacity] = useState("20");
	const [error, setError] = useState<MessageKey | null>(null);
	const [panel, setPanel] = useState<"list" | "add">("list");
	const centers = (list.data?.centers ?? []) as SessionCenter[];

	useEffect(() => {
		const first = centers[0];
		if (!centerId && first) setCenterId(first.id);
	}, [centerId, centers]);

	async function onSave(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		if (!online) {
			setError("sessionOffline");
			return;
		}
		const trainerUserId = user?.id;
		if (!trainerUserId || !centerId) {
			setError("tryAgain");
			return;
		}
		const parsedMinutes = Number(minutes);
		const parsedCapacity = Number(capacity);
		if (!topic.trim()) {
			setError("sessionTopicInvalid");
			return;
		}
		if (!startsAt) {
			setError("sessionTimeInvalid");
			return;
		}
		if (
			!Number.isInteger(parsedMinutes) ||
			parsedMinutes < 15 ||
			parsedMinutes > 480
		) {
			setError("sessionMinutesInvalid");
			return;
		}
		if (
			!Number.isInteger(parsedCapacity) ||
			parsedCapacity < 1 ||
			parsedCapacity > 500
		) {
			setError("sessionCapacityInvalid");
			return;
		}
		try {
			const saved = await create.mutateAsync({
				body: {
					centerId,
					topic: topic.trim(),
					trainerUserId,
					startsAt: new Date(startsAt).toISOString(),
					minutes: parsedMinutes,
					capacity: parsedCapacity,
				},
			});
			await list.invalidate();
			navigate(`/sessions/${saved.id}`);
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

	const items = (list.data.items ?? []) as SessionItem[];
	const canCreate = list.data.canCreate === true;

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<div>
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{t("centerSessionsTitle")}
				</h1>
				<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
					{t("sessionsSentence")}
				</p>
			</div>
			{canCreate ? (
				<PageTabs
					label={t("centerSessionsTitle")}
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
						<label className="flex flex-col gap-2" htmlFor="session-center">
							<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
								{t("sessionCenter")}
							</span>
							<select
								id="session-center"
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
					<label className="flex flex-col gap-2" htmlFor="session-topic">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("sessionTopic")}
						</span>
						<input
							id="session-topic"
							className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
							value={topic}
							maxLength={120}
							onChange={(event) => setTopic(event.target.value)}
						/>
					</label>
					<label className="flex flex-col gap-2" htmlFor="session-when">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("sessionWhen")}
						</span>
						<input
							id="session-when"
							type="datetime-local"
							className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
							value={startsAt}
							onChange={(event) => setStartsAt(event.target.value)}
						/>
					</label>
					<div className="grid gap-4 sm:grid-cols-2">
						<label className="flex flex-col gap-2" htmlFor="session-minutes">
							<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
								{t("sessionMinutes")}
							</span>
							<input
								id="session-minutes"
								inputMode="numeric"
								className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
								value={minutes}
								onChange={(event) => setMinutes(event.target.value)}
							/>
						</label>
						<label className="flex flex-col gap-2" htmlFor="session-capacity">
							<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
								{t("sessionCapacity")}
							</span>
							<input
								id="session-capacity"
								inputMode="numeric"
								className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
								value={capacity}
								onChange={(event) => setCapacity(event.target.value)}
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
					{topic.trim() && startsAt ? (
						<Button
							type="submit"
							variant="sticker"
							className="w-fit"
							disabled={create.isPending}
						>
							{t("sessionSave")}
						</Button>
					) : null}
				</form>
			) : null}
			{panel === "list" || !canCreate ? (
				items.length === 0 ? (
					<EmptyState sentence={t("sessionsEmpty")} />
				) : (
					<RecordTable
						caption={t("centerSessionsTitle")}
						columns={[
							t("centerLabel"),
							t("nameLabel"),
							t("deviceKind"),
							t("status"),
							t("openRow"),
						]}
						rows={items.map((item) => {
							const status = statusOf(item);
							const course = courseTitle(
								locale,
								item.courseTitleRw,
								item.courseTitleEn,
							);
							return {
								key: item.id,
								cells: [
									item.centerName,
									item.topic,
									course ?? t("sessionsNav"),
									<Badge key="status" variant={status.variant}>
										{t(status.key)}
									</Badge>,
									<Link
										key="open"
										to={`/sessions/${item.id}`}
										className="underline"
									>
										{t("openRow")}
									</Link>,
								],
							};
						})}
					/>
				)
			) : null}
		</section>
	);
}
