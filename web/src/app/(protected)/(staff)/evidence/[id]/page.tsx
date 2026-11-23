import { type FormEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
	invalidateEngine,
	isApiClientError,
	useEngine,
	useEngineMutation,
} from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { useOnline } from "@/lib/offline/use-online";

type WaitingStatus = "pending" | "in_review";

type EvidenceReview = {
	id: string;
	attempt: number;
	status: WaitingStatus;
	evidenceType: "photo" | "file" | "note";
	submittedAt: string;
	urgency?: "ok" | "soon" | "overdue";
	escalation?: "none" | "manager" | "district";
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
		passThreshold: number;
		promptRw: string;
		promptEn: string;
	}[];
};

type SendBackKind = "needs_revision" | "rejected";
type RejectReason =
	| "not_the_task"
	| "not_the_learner"
	| "unreadable"
	| "incomplete";

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

const REJECT_REASONS = [
	"not_the_task",
	"not_the_learner",
	"unreadable",
	"incomplete",
] as const;

function reasonKey(reason: RejectReason): MessageKey {
	switch (reason) {
		case "not_the_task":
			return "reasonNotTheTask";
		case "not_the_learner":
			return "reasonNotTheLearner";
		case "unreadable":
			return "reasonUnreadable";
		case "incomplete":
			return "reasonIncomplete";
		default: {
			const unreachable: never = reason;
			return unreachable;
		}
	}
}

function decisionError(
	caught: unknown,
	t: (key: MessageKey) => string,
): string {
	if (!isApiClientError(caught)) return t("tryAgain");
	const details = caught.details;
	const reason =
		details && typeof details === "object" && "reason" in details
			? details.reason
			: undefined;
	switch (reason) {
		case "self":
			return t("conflictSelf");
		case "relative":
			return t("conflictRelative");
		case "feedback":
			return t("feedbackRequired");
		case "note":
			return t("rejectNoteRequired");
		case "reason":
			return t("rejectReasonRequired");
		case "score":
			return t("scoreInvalid");
		case "threshold":
			return t("scoreBelow");
		case "closed":
			return t("evidenceLeftQueue");
		default:
			return t("tryAgain");
	}
}

function parsedScores(
	criteria: EvidenceReview["criteria"],
	draft: Record<string, string>,
): { criterionId: string; score: number }[] | "invalid" {
	const scores: { criterionId: string; score: number }[] = [];
	for (const criterion of criteria) {
		const raw = draft[criterion.id]?.trim() ?? "";
		if (!/^\d+$/.test(raw)) return "invalid";
		const score = Number(raw);
		if (score > 100) return "invalid";
		scores.push({ criterionId: criterion.id, score });
	}
	return scores;
}

export default function EvidenceReviewPage() {
	const { id = "" } = useParams();
	const navigate = useNavigate();
	const { locale, t } = useI18n();
	const online = useOnline();
	const [left, setLeft] = useState(false);
	const [kind, setKind] = useState<SendBackKind>("needs_revision");
	const [reason, setReason] = useState<RejectReason>("not_the_task");
	const [note, setNote] = useState("");
	const [scores, setScores] = useState<Record<string, string>>({});
	const [formError, setFormError] = useState<string | null>(null);
	const claimed = useRef(false);
	const sheet = useRef<HTMLDialogElement>(null);
	const approveKey = useRef(crypto.randomUUID());
	const review = useEngine(
		"/evidence-queue/:id",
		{ query: { id } },
		{ enabled: id.length > 0 },
	);
	const start = useEngineMutation("/evidence-queue/:id/start");
	const decide = useEngineMutation("/verifications/create");
	const snippets = useEngine("/feedback-snippets");

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
	const savedLines = (snippets.data?.items ?? []) as {
		id: string;
		locale: "rw" | "en";
		body: string;
	}[];
	const inLocale = savedLines.filter((line) => line.locale === locale);
	const snippetLines = inLocale.length > 0 ? inLocale : savedLines;
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

	async function onApprove() {
		const parsed = parsedScores(item.criteria, scores);
		if (parsed === "invalid") {
			setFormError(t("scoreInvalid"));
			return;
		}
		setFormError(null);
		try {
			await decide.mutateAsync({
				body: {
					submissionId: id,
					decision: "approved",
					note: t("approvedNote"),
					idempotencyKey: approveKey.current,
					...(parsed.length > 0 ? { scores: parsed } : {}),
				},
			});
			await invalidateEngine("/evidence-queue");
			navigate("/evidence");
		} catch (caught) {
			setFormError(decisionError(caught, t));
		}
	}

	function openSheet() {
		setFormError(null);
		sheet.current?.showModal();
	}

	async function onSendBack(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const text = note.trim();
		if (!text) {
			setFormError(
				t(
					kind === "needs_revision" ? "feedbackRequired" : "rejectNoteRequired",
				),
			);
			return;
		}
		const parsed = parsedScores(item.criteria, scores);
		if (parsed === "invalid") {
			setFormError(t("scoreInvalid"));
			return;
		}
		setFormError(null);
		try {
			await decide.mutateAsync({
				body: {
					submissionId: id,
					decision: kind,
					note: text,
					...(kind === "rejected" ? { reasonCode: reason } : {}),
					...(parsed.length > 0 ? { scores: parsed } : {}),
				},
			});
			sheet.current?.close();
			await invalidateEngine("/evidence-queue");
			navigate("/evidence");
		} catch (caught) {
			setFormError(decisionError(caught, t));
		}
	}

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
					{item.urgency === "soon" ? (
						<Badge variant="pending">{t("dueSoon")}</Badge>
					) : null}
					{item.urgency === "overdue" ? (
						<Badge variant="danger">{t("reviewOverdue")}</Badge>
					) : null}
					{item.escalation === "manager" ? (
						<Badge variant="pending">{t("escalatedManager")}</Badge>
					) : null}
					{item.escalation === "district" ? (
						<Badge variant="pending">{t("escalatedDistrict")}</Badge>
					) : null}
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
										{" · "}
										{t("passAt", { count: String(criterion.passThreshold) })}
									</p>
									<label
										className="mt-3 flex max-w-32 flex-col gap-2"
										htmlFor={`score-${criterion.id}`}
									>
										<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg-muted">
											{t("scoreLabel")}
										</span>
										<input
											id={`score-${criterion.id}`}
											inputMode="numeric"
											className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg tabular-nums text-fg"
											value={scores[criterion.id] ?? ""}
											aria-invalid={
												formError === t("scoreInvalid") || undefined
											}
											onChange={(event) =>
												setScores((current) => ({
													...current,
													[criterion.id]: event.target.value,
												}))
											}
										/>
									</label>
								</li>
							))}
						</ol>
					)}
				</section>
			</div>
			{online ? null : (
				<p className="font-sans text-lg text-fg">{t("offlineDecision")}</p>
			)}
			<Card variant="ink" className="flex flex-col gap-4">
				<p className="font-sans text-lg text-ink-fg">{t("approveLater")}</p>
				<Button
					type="button"
					variant="ink"
					className="w-fit"
					disabled={!online || decide.isPending}
					onClick={() => void onApprove()}
				>
					{t("approveEvidence")}
				</Button>
				{formError ? (
					<p className="font-sans text-lg text-danger">{formError}</p>
				) : null}
				<p className="font-sans text-lg text-ink-fg">{t("sendBackSentence")}</p>
				<Button
					type="button"
					variant="quiet"
					className="w-fit text-ink-fg"
					disabled={!online}
					onClick={openSheet}
				>
					{t("sendBackEvidence")}
				</Button>
			</Card>
			<dialog
				ref={sheet}
				className="w-[min(100%,36rem)] rounded-[28px] border border-line bg-canvas p-8 text-fg backdrop:bg-ink/40"
				onClose={() => setFormError(null)}
			>
				<form
					className="flex flex-col gap-4"
					onSubmit={(event) => void onSendBack(event)}
				>
					<h2 className="font-sans text-2xl font-semibold text-fg">
						{t("sendBackEvidence")}
					</h2>
					<div className="flex flex-wrap gap-2">
						<Button
							type="button"
							variant={kind === "needs_revision" ? "soft" : "quiet"}
							aria-pressed={kind === "needs_revision"}
							onClick={() => {
								setKind("needs_revision");
								setFormError(null);
							}}
						>
							{t("decisionNeedsRevision")}
						</Button>
						<Button
							type="button"
							variant={kind === "rejected" ? "soft" : "quiet"}
							aria-pressed={kind === "rejected"}
							onClick={() => {
								setKind("rejected");
								setFormError(null);
							}}
						>
							{t("decisionReject")}
						</Button>
					</div>
					{kind === "rejected" ? (
						<label className="flex flex-col gap-2" htmlFor="reject-reason">
							<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg-muted">
								{t("rejectReasonLabel")}
							</span>
							<select
								id="reject-reason"
								className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
								value={reason}
								onChange={(event) => {
									const next = event.target.value;
									if (
										next === "not_the_task" ||
										next === "not_the_learner" ||
										next === "unreadable" ||
										next === "incomplete"
									) {
										setReason(next);
									}
								}}
							>
								{REJECT_REASONS.map((itemReason) => (
									<option key={itemReason} value={itemReason}>
										{t(reasonKey(itemReason))}
									</option>
								))}
							</select>
						</label>
					) : null}
					{snippetLines.length > 0 ? (
						<label className="flex flex-col gap-2" htmlFor="saved-line">
							<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg-muted">
								{t("feedbackInsert")}
							</span>
							<select
								id="saved-line"
								className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
								value=""
								onChange={(event) => {
									const body = snippetLines.find(
										(item) => item.id === event.target.value,
									)?.body;
									if (!body) return;
									setNote((current) =>
										current.trim() ? `${current.trim()}\n${body}` : body,
									);
								}}
							>
								<option value="">{t("feedbackInsertNone")}</option>
								{snippetLines.map((item) => (
									<option key={item.id} value={item.id}>
										{item.body}
									</option>
								))}
							</select>
						</label>
					) : null}
					<label className="flex flex-col gap-2" htmlFor="decision-note">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg-muted">
							{t(
								kind === "needs_revision" ? "feedbackLabel" : "rejectNoteLabel",
							)}
						</span>
						<textarea
							id="decision-note"
							className="min-h-32 rounded-md border border-line bg-card px-3 py-3 font-sans text-lg text-fg"
							value={note}
							aria-invalid={formError ? true : undefined}
							onChange={(event) => setNote(event.target.value)}
						/>
					</label>
					{formError ? (
						<p className="font-sans text-lg text-danger">{formError}</p>
					) : null}
					<div className="flex flex-wrap gap-3">
						<Button type="submit" disabled={decide.isPending}>
							{t("sendThisBack")}
						</Button>
						<Button
							type="button"
							variant="quiet"
							onClick={() => sheet.current?.close()}
						>
							{t("closeSheet")}
						</Button>
					</div>
				</form>
			</dialog>
		</article>
	);
}
