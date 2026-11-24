import { Link } from "react-router";
import { EmptyState } from "@/components/ui/empty-state";
import { RecordTable } from "@/components/ui/record-table";
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
			{evidence.length === 0 &&
			reviews.filter((row) => row.open).length === 0 ? (
				<EmptyState sentence={t("followUpsQueueEmpty")} />
			) : (
				<RecordTable
					caption={t("followUpsQueue")}
					columns={[
						t("nameLabel"),
						t("waitingTitle"),
						t("centerLabel"),
						t("openRow"),
					]}
					rows={[
						...evidence.map((row) => ({
							key: row.evidenceId,
							cells: [
								row.recipientName,
								t("followUpsDay", { day: String(row.day) }),
								row.centerName,
								<Link
									key="open"
									to={`/follow-up-queue/${row.evidenceId}`}
									className="underline"
								>
									{t("openRow")}
								</Link>,
							],
						})),
						...reviews
							.filter((row) => row.open)
							.map((row) => ({
								key: row.reviewId,
								cells: [
									row.recipientName,
									t("followUpsDay", { day: String(row.day) }),
									row.districtName,
									<Link
										key="open"
										to={`/follow-up-queue/close/${row.reviewId}`}
										className="underline"
									>
										{t("openRow")}
									</Link>,
								],
							})),
					]}
				/>
			)}
		</section>
	);
}
