import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PageTabs } from "@/components/ui/page-tabs";
import { RecordTable } from "@/components/ui/record-table";
import { callEngine, isApiClientError, useEngine } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";

type Funnel = {
	registered: number;
	enrolled: number;
	submitted: number;
	approved: number;
	badges: number;
	applicants: number;
	recipients: number;
	activeAt90Days: number;
};

type Slice = {
	label: string;
	registered: number;
	enrolled: number;
	applicants: number;
	recipients: number;
};

type Batch = {
	donor: string;
	items: {
		name: string;
		serial: string;
		centerName: string;
		districtName: string;
		status: string;
		outcome: string;
	}[];
};

type Report = {
	funnel: Funnel;
	districts: Slice[];
	ages: Slice[];
	sectors: Slice[];
	genders: Slice[];
	batches: Batch[];
};

const FUNNEL: { key: keyof Funnel; label: MessageKey }[] = [
	{ key: "registered", label: "equityRegistered" },
	{ key: "enrolled", label: "equityEnrolled" },
	{ key: "submitted", label: "equitySubmitted" },
	{ key: "approved", label: "equityApproved" },
	{ key: "badges", label: "equityBadges" },
	{ key: "applicants", label: "equityApplicants" },
	{ key: "recipients", label: "equityRecipients" },
	{ key: "activeAt90Days", label: "equityActive" },
];

function SliceTable({ title, rows }: { title: string; rows: Slice[] }) {
	const { t } = useI18n();
	if (rows.length === 0) {
		return (
			<p className="font-sans text-lg font-medium text-fg">
				{t("equityHidden")}
			</p>
		);
	}
	return (
		<RecordTable
			caption={title}
			columns={[
				t("nameLabel"),
				t("equityRegistered"),
				t("equityEnrolled"),
				t("equityApplicants"),
				t("equityRecipients"),
			]}
			rows={rows.map((row) => ({
				key: row.label,
				cells: [
					row.label,
					String(row.registered),
					String(row.enrolled),
					String(row.applicants),
					String(row.recipients),
				],
			}))}
		/>
	);
}

export default function EquityPage() {
	const { t } = useI18n();
	const report = useEngine("/equity");
	const [tab, setTab] = useState<"funnel" | "decisions" | "outcomes">("funnel");

	async function onDownload() {
		const result = await callEngine("/equity/export");
		const blob = new Blob([result.csv], { type: "text/csv" });
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = "ikiraro-equity.csv";
		link.click();
		URL.revokeObjectURL(url);
	}

	if (report.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(report.error) && report.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("equityDenied")}
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
					{t("equityTitle")}
				</h1>
				<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
					{t("equitySentence")}
				</p>
			</div>
			<Button
				type="button"
				variant="quiet"
				className="w-fit"
				onClick={() => void onDownload()}
			>
				{t("equityDownload")}
			</Button>
			<PageTabs
				label={t("equityTitle")}
				value={tab}
				onChange={setTab}
				tabs={[
					{ value: "funnel", label: t("equityFunnel") },
					{ value: "decisions", label: t("equityDecisions") },
					{ value: "outcomes", label: t("equityOutcomes") },
				]}
			/>
			{tab === "funnel" ? (
				<RecordTable
					caption={t("equityFunnel")}
					columns={[t("nameLabel"), t("status")]}
					rows={FUNNEL.map((row) => ({
						key: row.key,
						cells: [t(row.label), String(data.funnel[row.key])],
					}))}
				/>
			) : null}
			{tab === "decisions" ? (
				<div className="flex flex-col gap-8">
					<SliceTable title={t("equityDistricts")} rows={data.districts} />
					<SliceTable title={t("equityAges")} rows={data.ages} />
					<SliceTable title={t("equitySectors")} rows={data.sectors} />
					<SliceTable title={t("equityGenders")} rows={data.genders} />
				</div>
			) : null}
			{tab === "outcomes" ? (
				data.batches.length === 0 ? (
					<p className="font-sans text-lg font-medium text-fg">
						{t("equityBatchEmpty")}
					</p>
				) : (
					data.batches.map((batch) => (
						<RecordTable
							key={batch.donor}
							caption={batch.donor}
							columns={[
								t("nameLabel"),
								t("inventorySerial"),
								t("centerLabel"),
								t("districtLabel"),
								t("equityOutcomes"),
							]}
							rows={batch.items.map((item) => ({
								key: item.serial,
								cells: [
									item.name,
									item.serial,
									item.centerName,
									item.districtName,
									item.outcome,
								],
							}))}
						/>
					))
				)
			) : null}
		</section>
	);
}
