import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	callEngine,
	invalidateEngine,
	isApiClientError,
	useEngine,
	useEngineMutation,
} from "@/lib/engine";
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

type District = { id: string; name: string };

type Schedule = {
	districtId: string;
	districtName: string;
	intervalDays: number;
};

type Meta = {
	districts: District[];
	schedules: Schedule[];
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

function wholeDays(value: string): number | null {
	if (!/^[1-9]\d*$/.test(value.trim())) return null;
	return Number(value);
}

export default function ScheduledReportPage() {
	const { t } = useI18n();
	const report = useEngine("/donor-report");
	const meta = useEngine("/scheduled-report");
	const save = useEngineMutation("/scheduled-report/schedule");
	const [districtId, setDistrictId] = useState("");
	const [days, setDays] = useState("");
	const [error, setError] = useState<string | null>(null);

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

	if (report.isPending || meta.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (
		(isApiClientError(report.error) && report.error.status === 403) ||
		(isApiClientError(meta.error) && meta.error.status === 403)
	) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("donorDenied")}
			</p>
		);
	}
	if (report.error || meta.error || !report.data || !meta.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const data = report.data as Report;
	const schedule = meta.data as Meta;
	const chosen =
		schedule.districts.length === 1
			? (schedule.districts[0]?.id ?? "")
			: districtId;
	const intervalDays = wholeDays(days);
	const ready = Boolean(chosen) && intervalDays !== null;

	async function onSave() {
		if (!chosen || intervalDays === null) return;
		setError(null);
		try {
			await save.mutateAsync({
				body: { districtId: chosen, intervalDays },
			});
			setDays("");
			await invalidateEngine("/scheduled-report");
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : t("tryAgain"));
		}
	}

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<div>
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{t("scheduledReportTitle")}
				</h1>
				<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
					{t("scheduledReportSentence")}
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
			<table className="w-full border-collapse text-left">
				<thead>
					<tr className="font-meta text-xs uppercase text-fg-muted">
						<th className="border-b border-line py-2 font-semibold">
							{t("donorTotals")}
						</th>
						<th className="border-b border-line py-2 font-semibold">
							{t("scheduledReportCount")}
						</th>
					</tr>
				</thead>
				<tbody>
					{TOTALS.map((row) => (
						<tr key={row.key}>
							<td className="border-b border-line py-3 font-sans text-lg text-fg">
								{t(row.label)}
							</td>
							<td className="border-b border-line py-3 font-sans text-lg text-fg">
								{data.totals[row.key]}
							</td>
						</tr>
					))}
				</tbody>
			</table>
			<div className="flex flex-col gap-3">
				<h2 className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
					{t("donorDecisions")}
				</h2>
				{data.decisions.length === 0 ? (
					<p className="font-sans text-lg font-medium text-fg">
						{t("equityHidden")}
					</p>
				) : (
					<table className="w-full border-collapse text-left">
						<thead>
							<tr className="font-meta text-xs uppercase text-fg-muted">
								<th className="border-b border-line py-2 font-semibold">
									{t("scheduledReportDistrict")}
								</th>
								<th className="border-b border-line py-2 font-semibold">
									{t("donorAwarded")}
								</th>
								<th className="border-b border-line py-2 font-semibold">
									{t("donorDeclined")}
								</th>
							</tr>
						</thead>
						<tbody>
							{data.decisions.map((row) => (
								<tr key={row.district}>
									<td className="border-b border-line py-3 font-sans text-lg text-fg">
										{row.district}
									</td>
									<td className="border-b border-line py-3 font-sans text-lg text-fg">
										{row.awarded}
									</td>
									<td className="border-b border-line py-3 font-sans text-lg text-fg">
										{row.declined}
									</td>
								</tr>
							))}
						</tbody>
					</table>
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
					<table className="w-full border-collapse text-left">
						<thead>
							<tr className="font-meta text-xs uppercase text-fg-muted">
								<th className="border-b border-line py-2 font-semibold">
									{t("donorItems")}
								</th>
								<th className="border-b border-line py-2 font-semibold">
									{t("scheduledReportDistrict")}
								</th>
								<th className="border-b border-line py-2 font-semibold">
									{t("donorOutcomes")}
								</th>
							</tr>
						</thead>
						<tbody>
							{data.batches.map((row) => (
								<tr key={row.serial}>
									<td className="border-b border-line py-3 font-sans text-lg text-fg">
										{row.donor} · {row.name}
									</td>
									<td className="border-b border-line py-3 font-sans text-lg text-fg">
										{row.center} · {row.district}
									</td>
									<td className="border-b border-line py-3 font-sans text-lg text-fg">
										{row.outcome}
										{row.day30 ? ` · 30 ${row.day30}` : ""}
										{row.day90 ? ` · 90 ${row.day90}` : ""}
										{row.day180 ? ` · 180 ${row.day180}` : ""}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</div>
			<div className="flex flex-col gap-3">
				<h2 className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
					{t("scheduledReportTitle")}
				</h2>
				{schedule.schedules.length === 0 ? (
					<p className="font-sans text-lg font-medium text-fg">
						{t("scheduledReportEmpty")}
					</p>
				) : (
					<ul>
						{schedule.schedules.map((row) => (
							<li
								key={row.districtId}
								className="border-t border-line py-3 font-sans text-lg text-fg"
							>
								{t("scheduledReportEvery", {
									district: row.districtName,
									days: String(row.intervalDays),
								})}
							</li>
						))}
					</ul>
				)}
			</div>
			<form
				className="flex max-w-sm flex-col gap-4"
				onSubmit={(event) => {
					event.preventDefault();
					void onSave();
				}}
			>
				{schedule.districts.length > 1 ? (
					<label className="flex flex-col gap-2">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("scheduledReportDistrict")}
						</span>
						<select
							id="schedule-district"
							className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
							value={districtId}
							onChange={(event) => setDistrictId(event.target.value)}
						>
							<option value="">{t("scheduledReportChoose")}</option>
							{schedule.districts.map((row) => (
								<option key={row.id} value={row.id}>
									{row.name}
								</option>
							))}
						</select>
					</label>
				) : null}
				<label className="flex flex-col gap-2" htmlFor="schedule-days">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("scheduledReportDays")}
					</span>
					<Input
						id="schedule-days"
						inputMode="numeric"
						value={days}
						onChange={(event) => setDays(event.target.value)}
					/>
				</label>
				{ready ? (
					<Button type="submit" variant="ink" className="w-fit">
						{t("scheduledReportSave")}
					</Button>
				) : null}
				{error ? <p className="text-lg text-destructive">{error}</p> : null}
			</form>
		</section>
	);
}
