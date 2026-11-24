import { useState } from "react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTabs } from "@/components/ui/page-tabs";
import { RecordTable } from "@/components/ui/record-table";
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

function ReviewTable({
	items,
	empty,
}: {
	items: ReviewSummary[];
	empty: string;
}) {
	const { t } = useI18n();
	if (items.length === 0) return <EmptyState sentence={empty} />;
	return (
		<RecordTable
			caption={t("reviewsTitle")}
			columns={[t("nameLabel"), t("status"), t("openRow")]}
			rows={items.map((course) => ({
				key: course.id,
				cells: [
					course.title,
					<span key="status" className="flex flex-wrap gap-2">
						<Badge variant="neutral">{t(statusKey(course.status))}</Badge>
						{course.approved && course.status === "in_review" ? (
							<Badge variant="pending">{t("courseApproved")}</Badge>
						) : null}
						{course.missingKinyarwanda ? (
							<Badge variant="pending">{t("englishFallback")}</Badge>
						) : null}
					</span>,
					<Link key="open" to={`/reviews/${course.id}`} className="underline">
						{t("openRow")}
					</Link>,
				],
			}))}
		/>
	);
}

export default function ReviewQueuePage() {
	const { t } = useI18n();
	const queue = useEngine("/reviews");
	const [tab, setTab] = useState<"waiting" | "published" | "retired">(
		"waiting",
	);

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
				{tab === "waiting" && first ? (
					<Button variant="sticker" asChild>
						<Link to={`/reviews/${first.id}`}>{t("startReview")}</Link>
					</Button>
				) : null}
			</div>
			<PageTabs
				label={t("reviewsTitle")}
				value={tab}
				onChange={setTab}
				tabs={[
					{ value: "waiting", label: t("waitingHeading") },
					{ value: "published", label: t("publishedHeading") },
					{ value: "retired", label: t("retiredHeading") },
				]}
			/>
			<ReviewTable
				items={
					tab === "waiting"
						? waiting
						: tab === "published"
							? published
							: retired
				}
				empty={t("reviewsEmpty")}
			/>
		</section>
	);
}
