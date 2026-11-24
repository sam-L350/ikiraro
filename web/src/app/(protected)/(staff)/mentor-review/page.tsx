import { isApiClientError, useEngine } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

type Message = { id: string; senderName: string; body: string };
type Report = { id: string; reporterName: string; note: string };

export default function MentorReviewPage() {
	const { t } = useI18n();
	const review = useEngine("/mentor-review");

	if (review.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(review.error) && review.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("messagesReviewDenied")}
			</p>
		);
	}
	if (review.error || !review.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const messages = (review.data.messages ?? []) as Message[];
	const reports = (review.data.reports ?? []) as Report[];

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
				{t("messagesReview")}
			</h1>
			{messages.length === 0 ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("messagesReviewEmpty")}
				</p>
			) : (
				<ul>
					{messages.map((row) => (
						<li key={row.id} className="border-t border-ink/15 py-4">
							<p className="font-sans text-lg font-medium text-fg">
								{row.body}
							</p>
							<p className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
								{row.senderName}
							</p>
						</li>
					))}
				</ul>
			)}
			{reports.map((row) => (
				<p key={row.id} className="font-sans text-lg font-medium text-fg">
					{row.reporterName}: {row.note}
				</p>
			))}
		</section>
	);
}
