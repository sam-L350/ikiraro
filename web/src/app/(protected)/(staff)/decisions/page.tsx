import { useState } from "react";
import { Link } from "react-router";
import { EmptyState } from "@/components/ui/empty-state";
import { RecordTable } from "@/components/ui/record-table";
import { isApiClientError, useEngine } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

type DecisionRound = {
	id: string;
	title: string;
	districtName: string;
	quantity: number;
	applications: number;
};

export default function DecisionsPage() {
	const { t } = useI18n();
	const list = useEngine("/decisions");
	const [district, setDistrict] = useState("");

	if (list.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(list.error) && list.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("decisionsDenied")}
			</p>
		);
	}
	if (list.error || !list.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const rounds = (list.data.rounds ?? []) as DecisionRound[];
	const districts = [...new Set(rounds.map((round) => round.districtName))];
	const shown = district
		? rounds.filter((round) => round.districtName === district)
		: rounds;

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<div>
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{t("decisionsTitle")}
				</h1>
				<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
					{t("decisionsSentence")}
				</p>
			</div>
			{districts.length > 1 ? (
				<label
					className="flex max-w-xs flex-col gap-2"
					htmlFor="decision-district"
				>
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("districtLabel")}
					</span>
					<select
						id="decision-district"
						className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
						value={district}
						onChange={(event) => setDistrict(event.target.value)}
					>
						<option value="">{t("districtLabel")}</option>
						{districts.map((name) => (
							<option key={name} value={name}>
								{name}
							</option>
						))}
					</select>
				</label>
			) : null}
			{shown.length === 0 ? (
				<EmptyState sentence={t("decisionsEmpty")} />
			) : (
				<RecordTable
					caption={t("decisionsTitle")}
					columns={[
						t("nameLabel"),
						t("districtLabel"),
						t("roundsQuantity"),
						t("openRow"),
					]}
					rows={shown.map((round) => ({
						key: round.id,
						cells: [
							round.title,
							round.districtName,
							String(round.quantity),
							<Link
								key="open"
								to={`/decisions/${round.id}`}
								className="underline"
							>
								{t("openRow")}
							</Link>,
						],
					}))}
				/>
			)}
		</section>
	);
}
