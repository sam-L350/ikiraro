import { isApiClientError, useEngine } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

type CoverageRow = {
	sector: string;
	learners: number;
	homeCenter: string | null;
};

export default function CoveragePage() {
	const { t } = useI18n();
	const list = useEngine("/coverage");

	if (list.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(list.error) && list.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("coverageDenied")}
			</p>
		);
	}
	if (list.error || !list.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const sectors = (list.data.sectors ?? []) as CoverageRow[];

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<div>
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{t("coverageTitle")}
				</h1>
				<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
					{t("coverageSentence")}
				</p>
			</div>
			{sectors.length === 0 ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("coverageEmpty")}
				</p>
			) : (
				<table className="w-full border-collapse text-left">
					<thead>
						<tr className="font-meta text-xs uppercase text-fg-muted">
							<th className="border-b border-line py-2 font-semibold">
								{t("coverageSector")}
							</th>
							<th className="border-b border-line py-2 font-semibold">
								{t("coverageLearners")}
							</th>
							<th className="border-b border-line py-2 font-semibold">
								{t("coverageHome")}
							</th>
						</tr>
					</thead>
					<tbody>
						{sectors.map((row) => (
							<tr key={`${row.sector}-${row.homeCenter ?? "none"}`}>
								<td className="border-b border-line py-3 font-sans text-lg text-fg">
									{row.sector}
								</td>
								<td className="border-b border-line py-3 font-sans text-lg text-fg">
									{row.learners}
								</td>
								<td className="border-b border-line py-3 font-sans text-lg text-fg">
									{row.homeCenter ?? t("coverageNoHome")}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
		</section>
	);
}
