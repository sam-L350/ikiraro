import { Button } from "@/components/ui/button";
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

function SliceList({ title, rows }: { title: string; rows: Slice[] }) {
	const { t } = useI18n();
	return (
		<div className="flex flex-col gap-3">
			<h2 className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
				{title}
			</h2>
			{rows.length === 0 ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("equityHidden")}
				</p>
			) : (
				<ul>
					{rows.map((row) => (
						<li key={row.label} className="border-t border-ink/15 py-4">
							<p className="font-sans text-lg font-medium text-fg">
								{row.label}
							</p>
							<p className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
								{row.registered} · {row.enrolled} · {row.applicants} ·{" "}
								{row.recipients}
							</p>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

export default function EquityPage() {
	const { t } = useI18n();
	const report = useEngine("/equity");

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
			<div className="flex flex-col gap-3">
				<h2 className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
					{t("equityFunnel")}
				</h2>
				<ul>
					{FUNNEL.map((row) => (
						<li key={row.key} className="border-t border-ink/15 py-4">
							<p className="font-sans text-lg font-medium text-fg">
								{t(row.label)}
							</p>
							<p className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
								{data.funnel[row.key]}
							</p>
						</li>
					))}
				</ul>
			</div>
			<SliceList title={t("equityDistricts")} rows={data.districts} />
			<SliceList title={t("equityAges")} rows={data.ages} />
			<SliceList title={t("equitySectors")} rows={data.sectors} />
			<SliceList title={t("equityGenders")} rows={data.genders} />
			<div className="flex flex-col gap-3">
				<h2 className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
					{t("equityBatches")}
				</h2>
				{data.batches.length === 0 ? (
					<p className="font-sans text-lg font-medium text-fg">
						{t("equityBatchEmpty")}
					</p>
				) : (
					data.batches.map((batch) => (
						<div key={batch.donor} className="flex flex-col gap-2">
							<p className="font-sans text-lg font-medium text-fg">
								{batch.donor}
							</p>
							<ul>
								{batch.items.map((item) => (
									<li key={item.serial} className="border-t border-ink/15 py-4">
										<p className="font-sans text-lg font-medium text-fg">
											{item.name}
										</p>
										<p className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
											{item.serial} · {item.centerName} · {item.districtName} ·{" "}
											{item.outcome}
										</p>
									</li>
								))}
							</ul>
						</div>
					))
				)}
			</div>
		</section>
	);
}
