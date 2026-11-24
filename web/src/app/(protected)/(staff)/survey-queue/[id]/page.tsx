import { type FormEvent, useState } from "react";
import { useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { isApiClientError, useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

type Row = {
	id: string;
	kind: "baseline" | "endline";
	learnerName: string;
	digitalConfidence: number;
	tasksDigital: number;
	income: number;
	services: string;
	jobsOrCustomers: number;
};

export default function SurveyConfirmPage() {
	const { t } = useI18n();
	const { id = "" } = useParams();
	const queue = useEngine("/surveys/queue");
	const confirm = useEngineMutation("/surveys/:id/confirm");
	const [note, setNote] = useState("");

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
	const row = ((queue.data?.items ?? []) as Row[]).find(
		(item) => item.id === id,
	);
	if (!row) {
		return (
			<p className="font-sans text-lg font-medium text-fg">
				{t("surveysQueueEmpty")}
			</p>
		);
	}

	function onConfirm(event: FormEvent) {
		event.preventDefault();
		confirm.mutate(
			{ body: { id, note } },
			{ onSuccess: () => void queue.invalidate() },
		);
	}

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<div>
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{row.learnerName}
				</h1>
				<p className="mt-4 font-sans text-lg font-medium text-fg">
					{row.digitalConfidence} · {row.tasksDigital} · {row.income} ·{" "}
					{row.services} · {row.jobsOrCustomers}
				</p>
			</div>
			<form className="flex flex-col gap-4" onSubmit={onConfirm}>
				<label className="flex flex-col gap-2">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("surveysNote")}
					</span>
					<textarea
						className="min-h-28 rounded-md border border-ink/20 bg-paper px-3 py-3 font-sans text-lg text-fg"
						value={note}
						onChange={(event) => setNote(event.target.value)}
					/>
				</label>
				{note.trim() ? (
					<Button type="submit" className="w-fit" disabled={confirm.isPending}>
						{t("surveysConfirm")}
					</Button>
				) : null}
			</form>
		</section>
	);
}
