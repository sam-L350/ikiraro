import { Badge } from "@/components/ui/badge";
import { isApiClientError, useEngine } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";

type RejectReason =
	| "not_the_task"
	| "not_the_learner"
	| "unreadable"
	| "incomplete";

type TrainerQuality = {
	userId: number;
	name: string;
	decisions: number;
	approvalRate: number | null;
	reworkRate: number | null;
	medianReviewMinutes: number | null;
	disagreementRate: number | null;
	rejectionReasons: { reason: RejectReason; count: number }[];
};

type QualityAnomaly =
	| {
			kind: "points_fast";
			userId: number;
			name: string;
			amount: number;
			days: number;
	  }
	| {
			kind: "single_reviewer";
			userId: number;
			name: string;
			reviewerName: string;
			approvals: number;
	  };

type QualityReport = {
	trainers: TrainerQuality[];
	anomalies: QualityAnomaly[] | null;
};

function reasonKey(reason: RejectReason): MessageKey {
	switch (reason) {
		case "not_the_task":
			return "qualityReasonNotTask";
		case "not_the_learner":
			return "qualityReasonNotLearner";
		case "unreadable":
			return "qualityReasonUnreadable";
		case "incomplete":
			return "qualityReasonIncomplete";
		default: {
			const unreachable: never = reason;
			return unreachable;
		}
	}
}

function shown(
	value: number | null,
	t: (
		key: "qualityNone" | "qualityPercent",
		vars?: { count: string },
	) => string,
): string {
	if (value === null) return t("qualityNone");
	return t("qualityPercent", { count: String(value) });
}

function shownMinutes(
	value: number | null,
	t: (
		key: "qualityNone" | "qualityMinutes",
		vars?: { count: string },
	) => string,
): string {
	if (value === null) return t("qualityNone");
	return t("qualityMinutes", { count: String(value) });
}

function Rate({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex flex-col gap-1">
			<p className="font-meta text-xs uppercase text-fg-muted">{label}</p>
			<p className="font-sans text-3xl font-semibold text-fg">{value}</p>
		</div>
	);
}

export default function QualityPage() {
	const { t } = useI18n();
	const view = useEngine("/quality");

	if (view.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(view.error) && view.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("homeUnavailable")}
			</p>
		);
	}
	if (view.error || !view.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const data = view.data as QualityReport;
	const learner = (name: string) => name.trim() || t("learnerUnnamed");
	const trainer = (name: string) => name.trim() || t("qualityUnnamed");

	return (
		<section className="flex flex-col gap-10">
			<div>
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{t("qualityTitle")}
				</h1>
				<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
					{t("qualitySentence")}
				</p>
			</div>
			{data.trainers.length === 0 ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("qualityEmpty")}
				</p>
			) : (
				<ul>
					{data.trainers.map((row) => (
						<li
							key={row.userId}
							className="flex flex-col gap-4 border-t border-ink/15 py-6"
						>
							<div>
								<p className="font-sans text-lg font-semibold text-fg">
									{trainer(row.name)}
								</p>
								<p className="font-sans text-lg text-fg">
									{t("qualityDecisions", { count: String(row.decisions) })}
								</p>
							</div>
							<div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
								<Rate
									label={t("qualityApproval")}
									value={shown(row.approvalRate, t)}
								/>
								<Rate
									label={t("qualityRework")}
									value={shown(row.reworkRate, t)}
								/>
								<Rate
									label={t("qualityMedian")}
									value={shownMinutes(row.medianReviewMinutes, t)}
								/>
								<Rate
									label={t("qualityDisagreement")}
									value={shown(row.disagreementRate, t)}
								/>
							</div>
							{row.rejectionReasons.length > 0 ? (
								<div className="flex flex-col gap-2">
									<p className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
										{t("qualityReasons")}
									</p>
									<ul className="flex flex-wrap gap-2">
										{row.rejectionReasons.map((reason) => (
											<li key={reason.reason}>
												<Badge variant="neutral">
													{t(reasonKey(reason.reason))} {reason.count}
												</Badge>
											</li>
										))}
									</ul>
								</div>
							) : null}
						</li>
					))}
				</ul>
			)}
			{data.anomalies ? (
				<div className="flex flex-col gap-4">
					<h2 className="font-sans text-2xl font-semibold text-fg">
						{t("qualityAnomalies")}
					</h2>
					{data.anomalies.length === 0 ? (
						<p className="font-sans text-lg font-medium text-fg">
							{t("qualityAnomaliesEmpty")}
						</p>
					) : (
						<ul className="flex flex-col gap-3">
							{data.anomalies.map((row) => (
								<li key={`${row.kind}-${row.userId}`}>
									<p className="font-sans text-lg text-fg">
										{anomalySentence(row, t, learner, trainer)}
									</p>
								</li>
							))}
						</ul>
					)}
				</div>
			) : null}
		</section>
	);
}

function anomalySentence(
	row: QualityAnomaly,
	t: (
		key: "qualityPointsFast" | "qualitySingleReviewer",
		vars: { name: string; count: string; days?: string; reviewer?: string },
	) => string,
	learner: (name: string) => string,
	trainer: (name: string) => string,
): string {
	switch (row.kind) {
		case "points_fast":
			return t("qualityPointsFast", {
				name: learner(row.name),
				count: String(row.amount),
				days: String(row.days),
			});
		case "single_reviewer":
			return t("qualitySingleReviewer", {
				name: learner(row.name),
				reviewer: trainer(row.reviewerName),
				count: String(row.approvals),
			});
		default: {
			const unreachable: never = row;
			return unreachable;
		}
	}
}
