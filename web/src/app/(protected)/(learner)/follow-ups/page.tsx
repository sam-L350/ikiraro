import { Link } from "react-router";
import { isApiClientError, useEngine } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";

type FollowUp = {
	id: string;
	day: number;
	dueOn: string;
	response: "waiting" | "answered" | "unresponsive";
	asked: boolean;
};

function statusKey(row: FollowUp): MessageKey {
	if (row.response === "answered") return "followUpsAnswered";
	if (row.response === "unresponsive") return "followUpsSilent";
	return "followUpsWaiting";
}

export default function FollowUpsPage() {
	const { t } = useI18n();
	const list = useEngine("/follow-ups");

	if (list.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(list.error) && list.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("followUpsDenied")}
			</p>
		);
	}
	if (list.error || !list.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const items = (list.data.items ?? []) as FollowUp[];

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<div>
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{t("followUpsTitle")}
				</h1>
				<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
					{t("followUpsSentence")}
				</p>
			</div>
			{items.length === 0 ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("followUpsEmpty")}
				</p>
			) : (
				<ul>
					{items.map((row) => (
						<li key={row.id} className="border-t border-ink/15 py-4">
							<Link
								to={`/follow-ups/${row.id}`}
								className="font-sans text-lg font-medium text-fg"
							>
								{t("followUpsDay", { day: String(row.day) })}
							</Link>
							<p className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
								{row.dueOn} · {t(statusKey(row))}
							</p>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
