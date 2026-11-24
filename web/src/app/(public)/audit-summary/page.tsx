import { Link } from "react-router";
import { EmptyState } from "@/components/ui/empty-state";
import { RecordTable } from "@/components/ui/record-table";
import { useEngine } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

type PublicException = {
	id: string;
	reason: string;
	decidedAt: string;
};

export default function AuditSummaryPage() {
	const { t } = useI18n();
	const list = useEngine("/audit-summary");

	if (list.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (list.error || !list.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const items = (list.data.items ?? []) as PublicException[];

	return (
		<section className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-16">
			<div>
				<Link to="/" className="font-sans text-sm font-semibold text-fg">
					{t("wordmark")}
				</Link>
				<h1 className="mt-3 font-sans text-4xl font-semibold text-balance text-fg">
					{t("auditSummaryTitle")}
				</h1>
				<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
					{t("auditSummarySentence")}
				</p>
			</div>
			{items.length === 0 ? (
				<EmptyState sentence={t("auditSummaryEmpty")} />
			) : (
				<RecordTable
					caption={t("auditSummaryTitle")}
					columns={[t("sessionWhen"), t("auditAction")]}
					rows={items.map((item) => ({
						key: item.id,
						cells: [item.decidedAt.slice(0, 10), item.reason],
					}))}
				/>
			)}
		</section>
	);
}
