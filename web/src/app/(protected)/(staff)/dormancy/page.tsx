import { isApiClientError, useEngine } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";

type Alert = {
	id: string;
	recipientName: string;
	reason: "unanswered" | "not_practicing";
	day: number;
	districtName: string;
};

function reasonKey(reason: Alert["reason"]): MessageKey {
	if (reason === "unanswered") return "dormancyAnswering";
	return "dormancyPracticing";
}

export default function DormancyPage() {
	const { t } = useI18n();
	const list = useEngine("/dormancy");

	if (list.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(list.error) && list.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("dormancyDenied")}
			</p>
		);
	}
	if (list.error || !list.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const items = (list.data.items ?? []) as Alert[];

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<div>
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{t("dormancyTitle")}
				</h1>
				<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
					{t("dormancySentence")}
				</p>
			</div>
			{items.length === 0 ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("dormancyEmpty")}
				</p>
			) : (
				<ul>
					{items.map((row) => (
						<li key={row.id} className="border-t border-ink/15 py-4">
							<p className="font-sans text-lg font-medium text-fg">
								{row.recipientName}
							</p>
							<p className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
								{t(reasonKey(row.reason))} ·{" "}
								{t("followUpsDay", { day: String(row.day) })} ·{" "}
								{row.districtName}
							</p>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
