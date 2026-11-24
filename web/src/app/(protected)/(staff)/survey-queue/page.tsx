import { Link } from "react-router";
import { isApiClientError, useEngine } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

type Row = {
	id: string;
	kind: "baseline" | "endline";
	learnerName: string;
	centerName: string;
	services: string;
};

export default function SurveyQueuePage() {
	const { t } = useI18n();
	const queue = useEngine("/surveys/queue");

	if (queue.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(queue.error) && queue.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("surveysDenied")}
			</p>
		);
	}
	if (queue.error || !queue.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const items = (queue.data.items ?? []) as Row[];

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
				{t("surveysQueue")}
			</h1>
			{items.length === 0 ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("surveysQueueEmpty")}
				</p>
			) : (
				<ul>
					{items.map((row) => (
						<li key={row.id} className="border-t border-ink/15 py-4">
							<Link
								to={`/survey-queue/${row.id}`}
								className="font-sans text-lg font-medium text-fg"
							>
								{row.learnerName}
							</Link>
							<p className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
								{row.kind === "baseline"
									? t("surveysBaseline")
									: t("surveysEndline")}{" "}
								· {row.centerName}
							</p>
							<p className="font-sans text-lg font-medium text-fg">
								{row.services}
							</p>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
