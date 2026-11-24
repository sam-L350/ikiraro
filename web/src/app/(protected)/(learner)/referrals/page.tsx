import { Link } from "react-router";
import { EmptyState } from "@/components/ui/empty-state";
import { useEngine } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

type Row = { id: string; authorName: string; note: string; shown: boolean };

export default function ReferralsPage() {
	const { t } = useI18n();
	const list = useEngine("/referrals");

	if (list.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (list.error || !list.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const items = (list.data.items ?? []) as Row[];

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<div>
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{t("referralsTitle")}
				</h1>
				<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
					{t("referralsSentence")}
				</p>
			</div>
			{items.length === 0 ? (
				<EmptyState sentence={t("referralsEmpty")} />
			) : (
				<ul>
					{items.map((row) => (
						<li key={row.id} className="border-t border-ink/15 py-4">
							{row.shown ? (
								<p className="font-sans text-lg font-medium text-fg">
									{row.note}
								</p>
							) : (
								<Link
									to={`/referrals/${row.id}`}
									className="font-sans text-lg font-medium text-fg underline"
								>
									{row.note}
								</Link>
							)}
							<p className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
								{row.authorName}
								{row.shown ? ` · ${t("referralsShown")}` : ""}
							</p>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
