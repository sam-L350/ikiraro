import { useState } from "react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
	invalidateEngine,
	isApiClientError,
	useEngine,
	useEngineMutation,
} from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";

type ReviewUrgency = "ok" | "soon" | "overdue";
type EscalationStage = "none" | "manager" | "district";
type WaitingStatus = "pending" | "in_review";

type DuplicateKind = "none" | "same" | "other";

type QueueItem = {
	id: string;
	attempt: number;
	status: WaitingStatus;
	submittedAt: string;
	urgency: ReviewUrgency;
	escalation: EscalationStage;
	learnerName: string;
	centerName: string;
	taskTitleRw: string;
	taskTitleEn: string;
	duplicate: DuplicateKind;
};

function textFor(locale: "rw" | "en", rw: string, en: string): string {
	if (locale === "rw" && rw.trim()) return rw;
	if (en.trim()) return en;
	return rw;
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

function escalationKey(stage: EscalationStage): MessageKey | null {
	switch (stage) {
		case "none":
			return null;
		case "manager":
			return "escalatedManager";
		case "district":
			return "escalatedDistrict";
		default: {
			const unreachable: never = stage;
			return unreachable;
		}
	}
}

function duplicateKey(kind: DuplicateKind): MessageKey | null {
	switch (kind) {
		case "none":
			return null;
		case "same":
			return "duplicateSamePill";
		case "other":
			return "duplicateOtherPill";
		default: {
			const unreachable: never = kind;
			return unreachable;
		}
	}
}

function urgencyKey(urgency: ReviewUrgency): MessageKey | null {
	switch (urgency) {
		case "ok":
			return null;
		case "soon":
			return "dueSoon";
		case "overdue":
			return "reviewOverdue";
		default: {
			const unreachable: never = urgency;
			return unreachable;
		}
	}
}

const REJECT_REASONS = [
	"not_the_task",
	"not_the_learner",
	"unreadable",
	"incomplete",
] as const;

type RejectReason = (typeof REJECT_REASONS)[number];

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

function isRejectReason(value: string): value is RejectReason {
	switch (value) {
		case "not_the_task":
		case "not_the_learner":
		case "unreadable":
		case "incomplete":
			return true;
		default:
			return false;
	}
}

export default function EvidenceQueuePage() {
	const { locale, t } = useI18n();
	const [centerId, setCenterId] = useState("");
	const [selected, setSelected] = useState<string[]>([]);
	const [decision, setDecision] = useState("");
	const [reason, setReason] = useState("");
	const [note, setNote] = useState("");
	const [error, setError] = useState<string | null>(null);
	const queue = useEngine("/evidence-queue", {
		query: centerId ? { centerId } : {},
	});
	const apply = useEngineMutation("/verifications/bulk");

	if (queue.isLoading) {
		return <div className="h-8 w-48 animate-pulse rounded-full bg-surface" />;
	}
	if (queue.isError) {
		const denied = isApiClientError(queue.error) && queue.error.status === 403;
		return (
			<p className="font-sans text-lg font-medium text-fg">
				{t(denied ? "cannotReviewEvidence" : "tryAgain")}
			</p>
		);
	}

	const centers = queue.data?.centers ?? [];
	const items = (queue.data?.items ?? []) as QueueItem[];
	const ready =
		selected.length > 0 &&
		note.trim().length > 0 &&
		(decision === "approved" ||
			(decision === "rejected" && isRejectReason(reason)));

	function toggle(id: string) {
		setSelected((current) =>
			current.includes(id)
				? current.filter((item) => item !== id)
				: [...current, id],
		);
	}

	async function onApply() {
		if (!ready) return;
		setError(null);
		try {
			await apply.mutateAsync({
				body: {
					submissionIds: selected,
					decision,
					note: note.trim(),
					...(decision === "rejected" ? { reasonCode: reason } : {}),
				},
			});
			setSelected([]);
			setDecision("");
			setReason("");
			setNote("");
			await invalidateEngine("/evidence-queue");
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : t("tryAgain"));
		}
	}

	return (
		<section>
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
						{t("evidenceQueueTitle")}
					</h1>
					<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
						{t("evidenceQueueSentence")}
					</p>
				</div>
			</div>
			{centers.length > 1 ? (
				<label
					className="mt-8 flex max-w-xs flex-col gap-2"
					htmlFor="evidence-center"
				>
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg-muted">
						{t("evidenceCenterAll")}
					</span>
					<select
						id="evidence-center"
						className="h-11 rounded-xl border border-ink/15 bg-canvas px-3 font-sans text-fg"
						value={centerId}
						onChange={(event) => setCenterId(event.target.value)}
					>
						<option value="">{t("evidenceCenterAll")}</option>
						{centers.map((center) => (
							<option key={center.id} value={center.id}>
								{center.name}
							</option>
						))}
					</select>
				</label>
			) : null}
			{items.length === 0 ? (
				<div className="mt-10">
					<EmptyState sentence={t("evidenceQueueEmpty")} />
				</div>
			) : (
				<div className="mt-10 flex flex-col gap-6">
					<div className="flex max-w-xl flex-col gap-4">
						<label className="flex flex-col gap-2" htmlFor="bulk-decision">
							<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
								{t("bulkDecision")}
							</span>
							<select
								id="bulk-decision"
								className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
								value={decision}
								onChange={(event) => {
									setDecision(event.target.value);
									setReason("");
								}}
							>
								<option value="">{t("bulkChoose")}</option>
								<option value="approved">{t("bulkApprove")}</option>
								<option value="rejected">{t("bulkReject")}</option>
							</select>
						</label>
						{decision === "rejected" ? (
							<label className="flex flex-col gap-2" htmlFor="bulk-reason">
								<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
									{t("rejectReasonLabel")}
								</span>
								<select
									id="bulk-reason"
									className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
									value={reason}
									onChange={(event) => setReason(event.target.value)}
								>
									<option value="">{t("bulkChoose")}</option>
									{REJECT_REASONS.map((item) => (
										<option key={item} value={item}>
											{t(reasonKey(item))}
										</option>
									))}
								</select>
							</label>
						) : null}
						{decision === "approved" || decision === "rejected" ? (
							<label className="flex flex-col gap-2" htmlFor="bulk-note">
								<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
									{t("bulkNote")}
								</span>
								<textarea
									id="bulk-note"
									className="min-h-24 rounded-md border border-line bg-card px-3 py-3 font-sans text-lg text-fg"
									value={note}
									maxLength={2000}
									onChange={(event) => setNote(event.target.value)}
								/>
							</label>
						) : null}
						{error ? (
							<p className="font-sans text-lg text-danger" role="alert">
								{error}
							</p>
						) : null}
						{ready ? (
							<Button
								type="button"
								variant="ink"
								className="w-fit"
								disabled={apply.isPending}
								onClick={() => void onApply()}
							>
								{t("bulkApply")}
							</Button>
						) : null}
					</div>
					<table className="w-full border-collapse text-left">
						<thead>
							<tr className="font-meta text-xs uppercase text-fg-muted">
								<th className="border-b border-line py-2 font-semibold">
									<span className="sr-only">{t("bulkDecision")}</span>
								</th>
								<th className="border-b border-line py-2 font-semibold">
									{t("nameLabel")}
								</th>
								<th className="border-b border-line py-2 font-semibold">
									{t("taskLabel")}
								</th>
								<th className="border-b border-line py-2 font-semibold">
									{t("centerLabel")}
								</th>
								<th className="border-b border-line py-2 font-semibold">
									{t("waitingTitle")}
								</th>
								<th className="border-b border-line py-2 font-semibold">
									{t("status")}
								</th>
								<th className="border-b border-line py-2 font-semibold">
									{t("openRow")}
								</th>
							</tr>
						</thead>
						<tbody>
							{items.map((item) => {
								const learner = item.learnerName.trim() || t("learnerUnnamed");
								const urgency = urgencyKey(item.urgency);
								const escalation = escalationKey(item.escalation ?? "none");
								const duplicate = duplicateKey(item.duplicate);
								return (
									<tr key={item.id}>
										<td className="border-b border-line py-3">
											<input
												type="checkbox"
												className="size-5"
												checked={selected.includes(item.id)}
												aria-label={learner}
												onChange={() => toggle(item.id)}
											/>
										</td>
										<td className="border-b border-line py-3 font-sans text-lg text-fg">
											{learner}
										</td>
										<td className="border-b border-line py-3 font-sans text-lg text-fg">
											{textFor(locale, item.taskTitleRw, item.taskTitleEn)}
										</td>
										<td className="border-b border-line py-3 font-sans text-lg text-fg">
											{item.centerName}
										</td>
										<td className="border-b border-line py-3 font-sans text-lg text-fg">
											{waitingCopy(item.submittedAt, t)}
										</td>
										<td className="border-b border-line py-3">
											<div className="flex flex-wrap items-center gap-2">
												<Badge variant="neutral">
													{t(statusKey(item.status))}
												</Badge>
												{urgency ? (
													<Badge
														variant={
															item.urgency === "soon" ? "pending" : "danger"
														}
													>
														{t(urgency)}
													</Badge>
												) : null}
												{escalation ? (
													<Badge variant="pending">{t(escalation)}</Badge>
												) : null}
												{duplicate ? (
													<Badge
														variant={
															item.duplicate === "other" ? "danger" : "pending"
														}
													>
														{t(duplicate)}
													</Badge>
												) : null}
											</div>
										</td>
										<td className="border-b border-line py-3">
											<Link
												to={`/evidence/${item.id}`}
												className="font-sans text-lg text-fg underline"
											>
												{t("openRow")}
											</Link>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}
		</section>
	);
}
