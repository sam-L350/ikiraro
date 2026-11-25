import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RecordTable } from "@/components/ui/record-table";
import {
	invalidateEngine,
	isApiClientError,
	useEngine,
	useEngineMutation,
} from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

type Rule = {
	districtId: string;
	districtName: string;
	quietDays: number;
};

type WarningRow = {
	who: string;
	kind: "dropout" | "backlog";
	ageDays: number;
};

type District = { id: string; name: string };

type WarningList = {
	districts: District[];
	rules: Rule[];
	rows: WarningRow[];
};

function wholeDays(value: string): number | null {
	if (!/^[1-9]\d*$/.test(value.trim())) return null;
	return Number(value);
}

export default function WarningsPage() {
	const { t } = useI18n();
	const warnings = useEngine("/warnings");
	const save = useEngineMutation("/warnings/rule");
	const [districtId, setDistrictId] = useState("");
	const [days, setDays] = useState("");
	const [error, setError] = useState<string | null>(null);

	if (warnings.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(warnings.error) && warnings.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("warningsDenied")}
			</p>
		);
	}
	if (warnings.error || !warnings.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const data = warnings.data as WarningList;
	const chosen =
		data.districts.length === 1 ? (data.districts[0]?.id ?? "") : districtId;
	const quietDays = wholeDays(days);
	const ready = Boolean(chosen) && quietDays !== null;

	async function onSave() {
		if (!chosen || quietDays === null) return;
		setError(null);
		try {
			await save.mutateAsync({
				body: { districtId: chosen, quietDays },
			});
			setDays("");
			await invalidateEngine("/warnings");
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : t("tryAgain"));
		}
	}

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<div>
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{t("warningsTitle")}
				</h1>
				<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
					{t("warningsSentence")}
				</p>
			</div>
			{data.rules.length === 0 ? null : (
				<section className="rounded-[20px] bg-surface p-5 sm:p-6">
					<h2 className="font-sans text-2xl font-semibold text-fg">
						{t("warningsRules")}
					</h2>
					<ul className="mt-3 flex flex-col">
						{data.rules.map((rule) => (
							<li
								key={rule.districtId}
								className="flex items-baseline justify-between gap-4 border-t border-line py-3 first:border-t-0"
							>
								<span className="font-sans text-lg font-semibold text-fg">
									{rule.districtName}
								</span>
								<span className="font-sans text-base font-medium text-fg">
									{t("warningsAgeValue", { days: String(rule.quietDays) })}
								</span>
							</li>
						))}
					</ul>
				</section>
			)}
			{data.rows.length === 0 ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("warningsEmpty")}
				</p>
			) : (
				<RecordTable
					caption={t("warningsTitle")}
					columns={[t("warningsWho"), t("warningsKind"), t("warningsAge")]}
					rows={data.rows.map((row) => ({
						key: `${row.kind}-${row.who}`,
						cells: [
							row.who,
							<Badge
								key="kind"
								variant={row.kind === "dropout" ? "warn" : "action"}
							>
								{row.kind === "dropout"
									? t("warningsDropout")
									: t("warningsBacklog")}
							</Badge>,
							t("warningsAgeValue", { days: String(row.ageDays) }),
						],
					}))}
				/>
			)}
			<form
				className="flex max-w-sm flex-col gap-4 rounded-[20px] bg-surface p-5 sm:p-6"
				onSubmit={(event) => {
					event.preventDefault();
					void onSave();
				}}
			>
				{data.districts.length > 1 ? (
					<label className="flex flex-col gap-2">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("scheduledReportDistrict")}
						</span>
						<select
							id="warning-district"
							className="h-11 rounded-xl border border-line-strong bg-canvas px-3 font-sans text-lg text-fg"
							value={districtId}
							onChange={(event) => setDistrictId(event.target.value)}
						>
							<option value="">{t("scheduledReportChoose")}</option>
							{data.districts.map((row) => (
								<option key={row.id} value={row.id}>
									{row.name}
								</option>
							))}
						</select>
					</label>
				) : null}
				<label className="flex flex-col gap-2" htmlFor="quiet-days">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("warningsQuietDays")}
					</span>
					<Input
						id="quiet-days"
						inputMode="numeric"
						value={days}
						onChange={(event) => setDays(event.target.value)}
					/>
				</label>
				{ready ? (
					<Button type="submit" variant="ink" className="w-fit">
						{t("warningsSave")}
					</Button>
				) : null}
				{error ? <p className="text-lg text-destructive">{error}</p> : null}
			</form>
		</section>
	);
}
