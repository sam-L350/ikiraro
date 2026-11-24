import { Link } from "react-router";
import { EmptyState } from "@/components/ui/empty-state";
import { useEngine } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

type Match = { id: string; otherName: string; skill: string };

export default function MessagesPage() {
	const { t } = useI18n();
	const list = useEngine("/messages");

	if (list.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (list.error || !list.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const items = (list.data.items ?? []) as Match[];

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<div>
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{t("messagesTitle")}
				</h1>
				<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
					{t("messagesSentence")}
				</p>
			</div>
			{items.length === 0 ? (
				<EmptyState sentence={t("messagesEmpty")} />
			) : (
				<ul>
					{items.map((row) => (
						<li key={row.id} className="border-t border-ink/15 py-4">
							<Link
								to={`/messages/${row.id}`}
								className="font-sans text-lg font-medium text-fg underline"
							>
								{row.otherName}
							</Link>
							<p className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
								{row.skill}
							</p>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
