import { useState } from "react";
import { Button } from "@/components/ui/button";
import { invalidateEngine, useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

export default function QuestionQueuePage() {
	const { t } = useI18n();
	const queue = useEngine("/questions");
	const reply = useEngineMutation("/tasks/:id/answers/create");
	const decide = useEngineMutation("/tasks/:id/answers/decide");
	const [drafts, setDrafts] = useState<Record<string, string>>({});
	const [error, setError] = useState<string | null>(null);

	if (queue.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (queue.error || !queue.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	async function onReply(questionId: string) {
		const text = drafts[questionId]?.trim() ?? "";
		if (!text) return;
		setError(null);
		try {
			const row = queue.data?.waiting.find(
				(item) => item.questionId === questionId,
			);
			if (!row) return;
			await reply.mutateAsync({
				body: { id: row.taskId, questionId, body: text },
			});
			setDrafts((current) => ({ ...current, [questionId]: "" }));
			await invalidateEngine("/questions");
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : t("tryAgain"));
		}
	}

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<div>
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{t("taskQuestionsQueueTitle")}
				</h1>
				<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
					{t("taskQuestionsQueueSentence")}
				</p>
			</div>
			{queue.data.waiting.length === 0 ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("taskQuestionsQueueEmpty")}
				</p>
			) : (
				<table className="w-full border-collapse text-left">
					<thead>
						<tr className="font-meta text-xs uppercase text-fg-muted">
							<th className="border-b border-line py-2 font-semibold">
								{t("taskQuestionsBody")}
							</th>
							<th className="border-b border-line py-2 font-semibold">
								{t("taskQuestionsAnswer")}
							</th>
							<th className="border-b border-line py-2 font-semibold">
								{t("taskGroupPerson")}
							</th>
						</tr>
					</thead>
					<tbody>
						{queue.data.waiting.map((row) => (
							<tr key={row.answerId ?? row.questionId}>
								<td className="border-b border-line py-3 font-sans text-lg text-fg">
									{row.questionBody}
								</td>
								<td className="border-b border-line py-3 font-sans text-lg text-fg">
									{row.answerBody || (
										<textarea
											className="min-h-20 w-full rounded-md border border-line bg-card px-3 py-2 font-sans text-lg text-fg"
											value={drafts[row.questionId] ?? ""}
											onChange={(event) =>
												setDrafts((current) => ({
													...current,
													[row.questionId]: event.target.value,
												}))
											}
										/>
									)}
									{!row.answerId &&
									(drafts[row.questionId]?.trim() ?? "") !== "" ? (
										<Button
											type="button"
											variant="quiet"
											className="mt-2"
											onClick={() => void onReply(row.questionId)}
										>
											{t("taskQuestionsSaveAnswer")}
										</Button>
									) : null}
								</td>
								<td className="border-b border-line py-3 font-sans text-lg text-fg">
									{row.authorName}
									{row.answerId ? (
										<div className="mt-2 flex flex-col gap-2">
											<Button
												type="button"
												variant="quiet"
												onClick={() =>
													void decide
														.mutateAsync({
															body: {
																id: row.taskId,
																answerId: row.answerId ?? "",
																shown: true,
															},
														})
														.then(() => invalidateEngine("/questions"))
												}
											>
												{t("taskQuestionsShow")}
											</Button>
										</div>
									) : null}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
			{error ? (
				<p className="font-sans text-lg text-destructive">{error}</p>
			) : null}
		</section>
	);
}
