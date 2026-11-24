import { Link } from "react-router";
import { EmptyState } from "@/components/ui/empty-state";
import { useEngine } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

type AwardCondition = {
	id: string;
	itemName: string;
	conditions: string | null;
	agreed: boolean;
};

export default function ConditionsPage() {
	const { t } = useI18n();
	const list = useEngine("/conditions");

	if (list.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (list.error || !list.data) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("conditionsDenied")}
			</p>
		);
	}

	const grants = (list.data.grants ?? []) as AwardCondition[];

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<div>
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{t("conditionsTitle")}
				</h1>
				<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
					{t("conditionsSentence")}
				</p>
			</div>
			{grants.length === 0 ? (
				<EmptyState sentence={t("conditionsEmpty")} />
			) : (
				<ul>
					{grants.map((grant) => (
						<li key={grant.id} className="border-t border-ink/15 py-4">
							<Link
								to={`/conditions/${grant.id}`}
								className="flex flex-col gap-2"
							>
								<p className="font-sans text-lg font-medium text-fg">
									{grant.itemName}
								</p>
								<p className="font-sans text-lg font-medium text-fg">
									{grant.conditions ?? t("conditionsEmpty")}
								</p>
							</Link>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
