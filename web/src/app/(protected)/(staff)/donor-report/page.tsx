import { Button } from "@/components/ui/button";
import { callEngine, isApiClientError, useEngine } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";

type Totals = {
	items: number;
	awarded: number;
	declined: number;
	inUse: number;
	notInUse: number;
	unresponsive: number;
	baselines: number;
	endlines: number;
};

type Decision = { district: string; awarded: number; declined: number };

type Outcome = {
	paired: number;
	confidence: number;
	tasks: number;
	income: number;
	jobs: number;
};

type Batch = {
	donor: string;
	name: string;
	serial: string;
	center: string;
	district: string;
	outcome: string;
	day30: string;
	day90: string;
	day180: string;
};

type Report = {
	totals: Totals;
	decisions: Decision[];
	outcome: Outcome | null;
	batches: Batch[];
};

const TOTALS: { key: keyof Totals; label: MessageKey }[] = [
	{ key: "items", label: "donorItems" },
	{ key: "awarded", label: "donorAwarded" },
	{ key: "declined", label: "donorDeclined" },
	{ key: "inUse", label: "donorInUse" },
	{ key: "notInUse", label: "donorNotInUse" },
	{ key: "unresponsive", label: "donorUnresponsive" },
	{ key: "baselines", label: "donorBaselines" },
	{ key: "endlines", label: "donorEndlines" },
];

export default function DonorReportPage() {
	const { t } = useI18n();
	const report = useEngine("/donor-report");

	async function onDownload() {
		const result = await callEngine("/donor-report/export");
		const blob = new Blob([result.csv], { type: "text/csv" });
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = "ikiraro-donor-report.csv";
		link.click();
		URL.revokeObjectURL(url);
	}

	if (report.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(report.error) && report.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("donorDenied")}
			</p>
		);
	}
	if (report.error || !report.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const data = report.data as Report;

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<div>
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{t("donorTitle")}
				</h1>
				<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
					{t("donorSentence")}
				</p>
			</div>
			<Button
				type="button"
				variant="quiet"
				className="w-fit"
				onClick={() => void onDownload()}
			>
				{t("donorDownload")}
			</Button>
			<div className="flex flex-col gap-3">
				<h2 className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
					{t("donorTotals")}
				</h2>
				<ul>
					{TOTALS.map((row) => (
						<li key={row.key} className="border-t border-ink/15 py-4">
							<p className="font-sans text-lg font-medium text-fg">
								{t(row.label)}
							</p>
							<p className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
								{data.totals[row.key]}
							</p>
						</li>
					))}
				</ul>
			</div>
			<div className="flex flex-col gap-3">
				<h2 className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
					{t("donorDecisions")}
				</h2>
				{data.decisions.length === 0 ? (
					<p className="font-sans text-lg font-medium text-fg">
						{t("equityHidden")}
					</p>
				) : (
					<ul>
						{data.decisions.map((row) => (
							<li key={row.district} className="border-t border-ink/15 py-4">
								<p className="font-sans text-lg font-medium text-fg">
									{row.district}
								</p>
								<p className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
									{row.awarded} · {row.declined}
								</p>
							</li>
						))}
					</ul>
				)}
			</div>
			<div className="flex flex-col gap-3">
				<h2 className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
					{t("donorOutcomes")}
				</h2>
				{data.outcome ? (
					<p className="font-sans text-lg font-medium text-fg">
						{t("donorOutcomeLine", {
							paired: String(data.outcome.paired),
							confidence: String(data.outcome.confidence),
							tasks: String(data.outcome.tasks),
							income: String(data.outcome.income),
							jobs: String(data.outcome.jobs),
						})}
					</p>
				) : (
					<p className="font-sans text-lg font-medium text-fg">
						{t("equityHidden")}
					</p>
				)}
			</div>
			<div className="flex flex-col gap-3">
				<h2 className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
					{t("donorBatches")}
				</h2>
				{data.batches.length === 0 ? (
					<p className="font-sans text-lg font-medium text-fg">
						{t("equityBatchEmpty")}
					</p>
				) : (
					<ul>
						{data.batches.map((row) => (
							<li key={row.serial} className="border-t border-ink/15 py-4">
								<p className="font-sans text-lg font-medium text-fg">
									{row.donor} · {row.name}
								</p>
								<p className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
									{row.serial} · {row.center} · {row.district} · {row.outcome}
									{row.day30 ? ` · 30 ${row.day30}` : ""}
									{row.day90 ? ` · 90 ${row.day90}` : ""}
									{row.day180 ? ` · 180 ${row.day180}` : ""}
								</p>
							</li>
						))}
					</ul>
				)}
			</div>
		</section>
	);
}
