import { useState } from "react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isApiClientError, useEngine } from "@/lib/engine";
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

export default function EvidenceQueuePage() {
	const { locale, t } = useI18n();
	const [centerId, setCenterId] = useState("");
	const queue = useEngine("/evidence-queue", {
		query: centerId ? { centerId } : {},
	});

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
	const first = items[0];

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
				{first ? (
					<Button variant="sticker" asChild>
						<Link to={`/evidence/${first.id}`}>{t("startReview")}</Link>
					</Button>
				) : null}
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
				<p className="mt-10 font-sans text-lg font-medium text-fg">
					{t("evidenceQueueEmpty")}
				</p>
			) : (
				<ul className="mt-10">
					{items.map((item) => {
						const urgency = urgencyKey(item.urgency);
						const escalation = escalationKey(item.escalation ?? "none");
						const duplicate = duplicateKey(item.duplicate);
						const learner = item.learnerName.trim() || t("learnerUnnamed");
						return (
							<li key={item.id} className="border-t border-ink/15 py-5">
								<Link
									to={`/evidence/${item.id}`}
									className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start"
								>
									<div>
										<p className="font-sans text-lg font-semibold text-fg">
											{textFor(locale, item.taskTitleRw, item.taskTitleEn)}
										</p>
										<p className="mt-1 font-sans text-lg text-fg">
											{learner} · {item.centerName}
										</p>
									</div>
									<div className="flex flex-wrap items-center gap-2">
										<p className="font-sans text-lg tabular-nums text-fg">
											{waitingCopy(item.submittedAt, t)}
										</p>
										{urgency ? (
											<Badge
												variant={item.urgency === "soon" ? "pending" : "danger"}
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
										<Badge variant="neutral">{t(statusKey(item.status))}</Badge>
									</div>
								</Link>
							</li>
						);
					})}
				</ul>
			)}
		</section>
	);
}
