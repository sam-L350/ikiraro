import { type FormEvent, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isApiClientError, useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { useOnline } from "@/lib/offline/use-online";

type SessionLearner = {
	id: number;
	name: string;
	attended: boolean;
};

type SessionDetail = {
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
	checkInUrl: string;
	checkInQr: string;
	canMark: boolean;
	learners: SessionLearner[];
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

function markError(caught: unknown): MessageKey {
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
			if (caught.status === 403) return "homeUnavailable";
			return "tryAgain";
	}
}

export default function SessionPage() {
	const { locale, t } = useI18n();
	const online = useOnline();
	const { id = "" } = useParams();
	const session = useEngine(
		"/center-sessions/:id",
		{ query: { id } },
		{ enabled: Boolean(id) },
	);
	const mark = useEngineMutation("/center-sessions/:id/attendance");
	const [picked, setPicked] = useState<number[]>([]);
	const [error, setError] = useState<MessageKey | null>(null);
	const attendanceIds = useRef(new Map<number, string>());

	function attendanceId(learnerId: number): string {
		const existing = attendanceIds.current.get(learnerId);
		if (existing) return existing;
		const next = crypto.randomUUID();
		attendanceIds.current.set(learnerId, next);
		return next;
	}

	async function onMark(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		if (!online) {
			setError("sessionOffline");
			return;
		}
		try {
			for (const learnerId of picked) {
				await mark.mutateAsync({
					body: {
						id,
						learnerId,
						attendanceId: attendanceId(learnerId),
					},
				});
			}
			setPicked([]);
			await session.invalidate();
		} catch (caught) {
			setError(markError(caught));
			await session.invalidate();
		}
	}

	if (session.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(session.error) && session.error.status === 404) {
		return (
			<p className="font-sans text-lg font-medium text-fg">
				{t("sessionMissing")}
			</p>
		);
	}
	if (isApiClientError(session.error) && session.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("homeUnavailable")}
			</p>
		);
	}
	if (session.error || !session.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const detail = session.data as SessionDetail;
	const course = courseTitle(
		locale,
		detail.courseTitleRw,
		detail.courseTitleEn,
	);
	const learners = detail.learners ?? [];
	const showMark = detail.open && detail.canMark;
	const status = !detail.open
		? { key: "sessionClosed" as const, variant: "neutral" as const }
		: detail.taken >= detail.capacity
			? { key: "sessionFull" as const, variant: "danger" as const }
			: { key: "sessionOpen" as const, variant: "pending" as const };

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<div>
				<Link
					to="/sessions"
					className="font-sans text-sm font-semibold text-fg"
				>
					{t("centerSessionsTitle")}
				</Link>
				<h1 className="mt-4 font-sans text-4xl font-semibold text-balance text-fg">
					{detail.topic}
				</h1>
				<div className="mt-4 flex flex-wrap items-center gap-3">
					<Badge variant={status.variant}>{t(status.key)}</Badge>
					<p className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{detail.centerName}
						{detail.trainerName ? ` · ${detail.trainerName}` : ""}
					</p>
				</div>
				{course ? (
					<p className="mt-3 font-sans text-lg text-fg">{course}</p>
				) : null}
			</div>
			<div className="flex flex-col gap-3">
				<p className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
					{t("sessionQr")}
				</p>
				<img
					src={detail.checkInQr}
					alt={t("sessionQr")}
					width={180}
					height={180}
				/>
				<p className="font-meta text-xs text-fg">{detail.checkInUrl}</p>
			</div>
			<form
				className="flex flex-col gap-4"
				onSubmit={(event) => void onMark(event)}
			>
				{learners.length === 0 ? (
					<p className="font-sans text-lg font-medium text-fg">
						{t("sessionsEmpty")}
					</p>
				) : (
					<ul>
						{learners.map((learner) => (
							<li
								key={learner.id}
								className="flex items-center justify-between gap-4 border-t border-ink/15 py-4"
							>
								<label className="flex items-center gap-3 font-sans text-lg text-fg">
									<input
										type="checkbox"
										checked={picked.includes(learner.id)}
										disabled={learner.attended || !showMark}
										onChange={(event) => {
											setPicked((current) =>
												event.target.checked
													? [...current, learner.id]
													: current.filter((value) => value !== learner.id),
											);
										}}
									/>
									{learner.name.trim() || t("learnerUnnamed")}
								</label>
								{learner.attended ? (
									<Badge variant="neutral">{t("sessionPresent")}</Badge>
								) : null}
							</li>
						))}
					</ul>
				)}
				{error ? (
					<p className="font-sans text-sm font-medium text-danger" role="alert">
						{t(error)}
					</p>
				) : null}
				{showMark ? (
					<Button
						type="submit"
						variant="sticker"
						className="w-fit"
						disabled={mark.isPending || picked.length === 0}
					>
						{t("sessionMark")}
					</Button>
				) : null}
			</form>
		</section>
	);
}
