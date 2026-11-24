import { useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isApiClientError, useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { useOnline } from "@/lib/offline/use-online";

type SessionJoin = {
	topic: string;
	centerName: string;
	trainerName: string;
	startsAt: string;
	minutes: number;
	open: boolean;
	attended: boolean;
};

function checkInError(caught: unknown): MessageKey {
	if (!isApiClientError(caught)) return "tryAgain";
	const details = caught.details;
	const reason =
		details && typeof details === "object" && "reason" in details
			? details.reason
			: undefined;
	switch (reason) {
		case "window":
			return "sessionNotOpen";
		case "full":
			return "sessionIsFull";
		case "duplicate":
			return "sessionAlready";
		default:
			if (caught.status === 404) return "sessionMissing";
			return "tryAgain";
	}
}

export default function ScheduleJoinPage() {
	const { t } = useI18n();
	const online = useOnline();
	const { token = "" } = useParams();
	const join = useEngine(
		"/center-sessions/join",
		{ query: { token } },
		{ enabled: Boolean(token) },
	);
	const checkIn = useEngineMutation("/center-sessions/check-in");
	const [error, setError] = useState<MessageKey | null>(null);
	const attendanceId = useRef(crypto.randomUUID());

	async function onCheckIn() {
		setError(null);
		if (!online) {
			setError("sessionOffline");
			return;
		}
		try {
			await checkIn.mutateAsync({
				body: { token, attendanceId: attendanceId.current },
			});
			await join.invalidate();
		} catch (caught) {
			setError(checkInError(caught));
		}
	}

	if (join.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(join.error) && join.error.status === 404) {
		return (
			<p className="font-sans text-lg font-medium text-fg">
				{t("sessionMissing")}
			</p>
		);
	}
	if (isApiClientError(join.error) && join.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("homeUnavailable")}
			</p>
		);
	}
	if (join.error || !join.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const detail = join.data as SessionJoin;
	const showCheckIn = detail.open && !detail.attended;

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<div>
				<Link
					to="/schedule"
					className="font-sans text-sm font-semibold text-fg"
				>
					{t("scheduleTitle")}
				</Link>
				<h1 className="mt-4 font-sans text-4xl font-semibold text-balance text-fg">
					{detail.topic}
				</h1>
				<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
					{t("scheduleJoinSentence")}
				</p>
				<div className="mt-4 flex flex-wrap items-center gap-3">
					<Badge variant={detail.open ? "pending" : "neutral"}>
						{t(detail.open ? "sessionOpen" : "sessionClosed")}
					</Badge>
					{detail.attended ? (
						<Badge variant="neutral">{t("sessionPresent")}</Badge>
					) : null}
				</div>
				<p className="mt-3 font-sans text-sm text-fg">
					{detail.centerName}
					{detail.trainerName ? ` · ${detail.trainerName}` : ""}
				</p>
			</div>
			{detail.attended ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("scheduleCheckedIn")}
				</p>
			) : null}
			{error ? (
				<p className="font-sans text-sm font-medium text-danger" role="alert">
					{t(error)}
				</p>
			) : null}
			{showCheckIn ? (
				<Button
					type="button"
					variant="sticker"
					className="w-fit"
					disabled={checkIn.isPending}
					onClick={() => void onCheckIn()}
				>
					{t("scheduleCheckIn")}
				</Button>
			) : null}
		</section>
	);
}
