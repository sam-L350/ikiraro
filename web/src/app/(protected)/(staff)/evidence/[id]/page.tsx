import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { Badge } from "@/components/ui/badge";
import {
	invalidateEngine,
	isApiClientError,
	useEngine,
	useEngineMutation,
} from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";

type WaitingStatus = "pending" | "in_review";

type EvidenceReview = {
	id: string;
	attempt: number;
	status: WaitingStatus;
	evidenceType: "photo" | "file" | "note";
	submittedAt: string;
	learnerName: string;
	centerName: string;
	taskTitleRw: string;
	taskTitleEn: string;
	instructionsRw: string;
	instructionsEn: string;
	note: string | null;
	evidenceUrl: string | null;
	evidenceContentType: string | null;
	criteria: {
		id: string;
		weight: number;
		promptRw: string;
		promptEn: string;
	}[];
};

function textFor(locale: "rw" | "en", rw: string, en: string): string {
	if (locale === "rw" && rw.trim()) return rw;
	if (en.trim()) return en;
	return rw;
}

function statusKey(status: WaitingStatus): MessageKey {
	switch (status) {
		case "pending":
			return "submissionPending";
		case "in_review":
			return "submissionInReview";
		default: {
			const unreachable: never = status;
			return unreachable;
		}
	}
}

function waitingCopy(
	submittedAt: string,
	t: (
		key:
			| "waitingJustNow"
			| "waitingMinute"
			| "waitingMinutes"
			| "waitingHour"
			| "waitingHours"
			| "waitingDay"
			| "waitingDays",
		vars?: { count: string },
	) => string,
): string {
	const minutes = Math.max(
		0,
		Math.floor((Date.now() - Date.parse(submittedAt)) / 60_000),
	);
	if (minutes < 1) return t("waitingJustNow");
	if (minutes === 1) return t("waitingMinute");
	if (minutes < 60) return t("waitingMinutes", { count: String(minutes) });
	const hours = Math.floor(minutes / 60);
	if (hours === 1) return t("waitingHour");
	if (hours < 48) return t("waitingHours", { count: String(hours) });
	const days = Math.floor(hours / 24);
	if (days === 1) return t("waitingDay");
	return t("waitingDays", { count: String(days) });
}

export default function EvidenceReviewPage() {
	const { id = "" } = useParams();
	const { locale, t } = useI18n();
	const [left, setLeft] = useState(false);
	const claimed = useRef(false);
	const review = useEngine(
		"/evidence-queue/:id",
		{ query: { id } },
		{ enabled: id.length > 0 },
	);
	const start = useEngineMutation("/evidence-queue/:id/start");

	useEffect(() => {
		if (!id || review.data?.status !== "pending" || claimed.current) return;
		claimed.current = true;
		void start
			.mutateAsync({ body: { id } })
			.then(async () => {
				await invalidateEngine("/evidence-queue/:id");
				await invalidateEngine("/evidence-queue");
			})
			.catch((caught: unknown) => {
				if (isApiClientError(caught) && caught.status === 409) setLeft(true);
			});
	}, [id, review.data?.status, start]);

	if (review.isLoading) {
		return <div className="h-8 w-48 animate-pulse rounded-full bg-surface" />;
	}
	if (left) {
		return (
			<p className="font-sans text-lg font-medium text-fg">
				{t("evidenceLeftQueue")}
			</p>
		);
	}
	if (review.isError || !review.data) {
		const denied =
			isApiClientError(review.error) && review.error.status === 403;
		const missing =
			isApiClientError(review.error) && review.error.status === 404;
		return (
			<p className="font-sans text-lg font-medium text-fg">
				{t(
					denied
						? "cannotReviewEvidence"
						: missing
							? "evidenceLeftQueue"
							: "tryAgain",
				)}
			</p>
		);
	}

	const item = review.data as EvidenceReview;
	const title = textFor(locale, item.taskTitleRw, item.taskTitleEn);
	const instructions = textFor(
		locale,
		item.instructionsRw,
		item.instructionsEn,
	);
	const learner = item.learnerName.trim() || t("learnerUnnamed");
	const image =
		item.evidenceUrl !== null &&
		(item.evidenceContentType ?? "").startsWith("image/");
	const file =
		item.evidenceUrl !== null && item.evidenceContentType === "application/pdf";

	return (
		<article className="flex flex-col gap-8">
			<div>
				<Link
					to="/evidence"
					className="inline-flex min-h-11 items-center font-meta text-xs font-semibold uppercase tracking-wide text-fg-muted"
				>
					{t("evidenceQueueTitle")}
				</Link>
				<div className="mt-3 flex flex-wrap items-center gap-3">
					<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
						{title}
					</h1>
					<Badge variant="neutral">{t(statusKey(item.status))}</Badge>
				</div>
				<p className="mt-3 font-sans text-lg text-fg">
					{learner} · {item.centerName} ·{" "}
					{t("attemptLabel", { count: String(item.attempt) })} ·{" "}
					{waitingCopy(item.submittedAt, t)}
				</p>
			</div>
			<div className="grid items-start gap-10 lg:grid-cols-2">
				<section className="flex flex-col gap-4">
					<h2 className="font-meta text-xs font-semibold uppercase tracking-wide text-fg-muted">
						{t("evidenceQueueTitle")}
					</h2>
					{instructions ? (
						<p className="font-sans text-lg text-fg">{instructions}</p>
					) : null}
					{item.evidenceType === "note" ? (
						<p className="font-sans text-lg text-fg">{item.note}</p>
					) : null}
					{image ? (
						<img
							src={item.evidenceUrl ?? ""}
							alt={t("evidencePhotoAlt")}
							className="max-h-[32rem] w-full rounded-md bg-surface object-contain"
						/>
					) : null}
					{file ? (
						<a
							href={item.evidenceUrl ?? ""}
							className="inline-flex min-h-11 items-center font-sans text-lg text-fg underline"
							target="_blank"
							rel="noreferrer"
						>
							{t("openEvidenceFile")}
						</a>
					) : null}
					{item.evidenceType !== "note" && !image && !file ? (
						<p className="font-sans text-lg text-fg">{t("evidenceMissing")}</p>
					) : null}
				</section>
				<section className="flex flex-col gap-4">
					<h2 className="font-meta text-xs font-semibold uppercase tracking-wide text-fg-muted">
						{t("evidenceRubric")}
					</h2>
					{item.criteria.length === 0 ? (
						<p className="font-sans text-lg text-fg">{t("evidenceNoRubric")}</p>
					) : (
						<ol>
							{item.criteria.map((criterion) => (
								<li key={criterion.id} className="border-t border-ink/15 py-4">
									<p className="font-sans text-lg text-fg">
										{textFor(locale, criterion.promptRw, criterion.promptEn)}
									</p>
									<p className="mt-2 font-meta text-xs font-semibold uppercase tracking-wide text-fg-muted">
										{t("criterionWeight", { count: String(criterion.weight) })}
									</p>
								</li>
							))}
						</ol>
					)}
				</section>
			</div>
		</article>
	);
}
