import { Link } from "react-router";
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
			{rounds.length === 0 ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("decisionsEmpty")}
				</p>
			) : (
				<ul>
					{rounds.map((round) => (
						<li key={round.id} className="border-t border-ink/15 py-4">
							<Link
								to={`/decisions/${round.id}`}
								className="flex flex-col gap-2"
							>
								<p className="font-sans text-lg font-medium text-fg">
									{round.title}
								</p>
								<p className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
									{round.districtName} ·{" "}
									{t("allocationItems", { count: String(round.quantity) })} ·{" "}
									{round.applications}
								</p>
							</Link>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
