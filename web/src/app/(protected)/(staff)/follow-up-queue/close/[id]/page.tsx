import { useState } from "react";
import { useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { isApiClientError, useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

type Review = {
	reviewId: string;
	day: number;
	recipientName: string;
	open: boolean;
};

export default function FollowUpClosePage() {
	const { t } = useI18n();
	const { id = "" } = useParams();
	const queue = useEngine("/follow-ups/queue");
	const close = useEngineMutation("/follow-ups/close");
	const [note, setNote] = useState("");

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
	const review = ((queue.data?.reviews ?? []) as Review[]).find(
		(row) => row.reviewId === id,
	);
	if (!review?.open) {
		return (
			<p className="font-sans text-lg font-medium text-fg">
				{t("followUpsQueueEmpty")}
			</p>
		);
	}

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
				{review.recipientName}
			</h1>
			<form
				className="flex flex-col gap-4"
				onSubmit={(event) => {
					event.preventDefault();
					close.mutate(
						{ body: { reviewId: id, note } },
						{ onSuccess: () => void queue.invalidate() },
					);
				}}
			>
				<label className="flex flex-col gap-2">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("followUpsDecisionNote")}
					</span>
					<textarea
						className="min-h-28 rounded-md border border-ink/20 bg-paper px-3 py-3 font-sans text-lg text-fg"
						value={note}
						onChange={(event) => setNote(event.target.value)}
					/>
				</label>
				<Button type="submit" className="w-fit" disabled={close.isPending}>
					{t("followUpsClose")}
				</Button>
			</form>
		</section>
	);
}
