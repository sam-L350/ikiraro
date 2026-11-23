import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isApiClientError, useEngine } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";

type ContentStatus = "draft" | "in_review" | "published" | "retired";

type ReviewSummary = {
	id: string;
	status: ContentStatus;
	title: string;
	missingKinyarwanda: boolean;
	approved: boolean;
};

function statusKey(status: ContentStatus): MessageKey {
	switch (status) {
		case "draft":
			return "statusDraft";
		case "in_review":
			return "statusInReview";
		case "published":
			return "statusPublished";
		case "retired":
			return "statusRetired";
		default: {
			const unreachable: never = status;
			return unreachable;
		}
	}
}

function QueueList({
	heading,
	items,
}: {
	heading: string;
	items: ReviewSummary[];
}) {
	const { t } = useI18n();
	if (items.length === 0) return null;
	return (
		<div className="mt-10">
			<h2 className="font-meta text-xs font-semibold uppercase tracking-wide text-fg-muted">
				{heading}
			</h2>
			<ul className="mt-4">
				{items.map((course) => (
					<li key={course.id} className="border-t border-ink/15 py-5">
						<Link to={`/reviews/${course.id}`} className="group block">
							<p className="font-sans text-lg font-semibold text-fg group-hover:underline">
								{course.title}
							</p>
							<div className="mt-3 flex flex-wrap gap-2">
								<Badge variant="neutral">{t(statusKey(course.status))}</Badge>
								{course.approved && course.status === "in_review" ? (
									<Badge variant="pending">{t("courseApproved")}</Badge>
								) : null}
								{course.missingKinyarwanda ? (
									<Badge variant="pending">{t("englishFallback")}</Badge>
								) : null}
							</div>
						</Link>
					</li>
				))}
			</ul>
		</div>
	);
}

export default function ReviewQueuePage() {
	const { t } = useI18n();
	const queue = useEngine("/reviews");

	if (queue.isLoading) {
		return <div className="h-8 w-48 animate-pulse rounded-full bg-surface" />;
	}
	if (queue.isError) {
		const denied = isApiClientError(queue.error) && queue.error.status === 403;
		return (
			<p className="font-sans text-lg font-medium text-fg">
				{t(denied ? "cannotPublishContent" : "tryAgain")}
			</p>
		);
	}

	const waiting = queue.data?.waiting ?? [];
	const published = queue.data?.published ?? [];
	const retired = queue.data?.retired ?? [];
	const first = waiting[0];

	return (
		<section className="max-w-3xl">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
						{t("reviewsTitle")}
					</h1>
					<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
						{t("reviewsSentence")}
					</p>
				</div>
				{first ? (
					<Button variant="sticker" asChild>
						<Link to={`/reviews/${first.id}`}>{t("startReview")}</Link>
					</Button>
				) : null}
			</div>
			{waiting.length === 0 ? (
				<p className="mt-10 font-sans text-lg font-medium text-fg">
					{t("reviewsEmpty")}
				</p>
			) : (
				<QueueList heading={t("waitingHeading")} items={waiting} />
			)}
			<QueueList heading={t("publishedHeading")} items={published} />
			<QueueList heading={t("retiredHeading")} items={retired} />
		</section>
	);
}
