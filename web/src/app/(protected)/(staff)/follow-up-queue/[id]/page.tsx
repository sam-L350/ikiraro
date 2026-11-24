import { useState } from "react";
import { useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { isApiClientError, useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

type Evidence = {
	evidenceId: string;
	followUpId: string;
	day: number;
	note: string;
	recipientName: string;
};

export default function FollowUpDecisionPage() {
	const { t } = useI18n();
	const { id = "" } = useParams();
	const queue = useEngine("/follow-ups/queue");
	const decide = useEngineMutation("/follow-ups/:id/decide");
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
	const evidence = ((queue.data?.evidence ?? []) as Evidence[]).find(
		(row) => row.evidenceId === id,
	);
	if (!evidence) {
		return (
			<p className="font-sans text-lg font-medium text-fg">
				{t("followUpsQueueEmpty")}
			</p>
		);
	}

	function onDecide(decision: "approved" | "needs_revision" | "rejected") {
		decide.mutate(
			{
				body: {
					id: evidence?.followUpId ?? "",
					evidenceId: id,
					decision,
					note,
				},
			},
			{ onSuccess: () => void queue.invalidate() },
		);
	}

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<div>
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{evidence.recipientName}
				</h1>
				<p className="mt-4 font-sans text-lg font-medium text-fg">
					{evidence.note}
				</p>
			</div>
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
			<div className="flex flex-wrap gap-3">
				<Button
					type="button"
					onClick={() => onDecide("approved")}
					disabled={decide.isPending}
				>
					{t("followUpsApprove")}
				</Button>
				<Button
					type="button"
					variant="quiet"
					onClick={() => onDecide("needs_revision")}
					disabled={decide.isPending}
				>
					{t("followUpsRevise")}
				</Button>
				<Button
					type="button"
					variant="quiet"
					onClick={() => onDecide("rejected")}
					disabled={decide.isPending}
				>
					{t("followUpsReject")}
				</Button>
			</div>
		</section>
	);
}
