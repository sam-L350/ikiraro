import { Link } from "react-router";
import { isApiClientError, useEngine } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

type Evidence = {
	evidenceId: string;
	day: number;
	note: string;
	recipientName: string;
	centerName: string;
};

type Review = {
	reviewId: string;
	day: number;
	recipientName: string;
	districtName: string;
	open: boolean;
};

export default function FollowUpQueuePage() {
	const { t } = useI18n();
	const queue = useEngine("/follow-ups/queue");

	if (queue.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(queue.error) && queue.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("followUpsDenied")}
			</p>
		);
	}
	if (queue.error || !queue.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const evidence = (queue.data.evidence ?? []) as Evidence[];
	const reviews = (queue.data.reviews ?? []) as Review[];

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<div>
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{t("followUpsQueue")}
				</h1>
			</div>
			{evidence.length === 0 && reviews.length === 0 ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("followUpsQueueEmpty")}
				</p>
			) : null}
			<ul>
				{evidence.map((row) => (
					<li key={row.evidenceId} className="border-t border-ink/15 py-4">
						<Link
							to={`/follow-up-queue/${row.evidenceId}`}
							className="font-sans text-lg font-medium text-fg"
						>
							{row.recipientName}
						</Link>
						<p className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("followUpsDay", { day: String(row.day) })} · {row.centerName}
						</p>
						<p className="font-sans text-lg font-medium text-fg">{row.note}</p>
					</li>
				))}
				{reviews
					.filter((row) => row.open)
					.map((row) => (
						<li key={row.reviewId} className="border-t border-ink/15 py-4">
							<Link
								to={`/follow-up-queue/close/${row.reviewId}`}
								className="font-sans text-lg font-medium text-fg"
							>
								{row.recipientName}
							</Link>
							<p className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
								{t("followUpsSilent")} ·{" "}
								{t("followUpsDay", { day: String(row.day) })} ·{" "}
								{row.districtName}
							</p>
						</li>
					))}
			</ul>
		</section>
	);
}
