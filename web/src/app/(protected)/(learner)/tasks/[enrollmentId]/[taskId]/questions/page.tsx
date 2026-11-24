import { type FormEvent, useState } from "react";
import { useParams } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { invalidateEngine, useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

export default function TaskQuestionsPage() {
	const { taskId = "" } = useParams();
	const { t } = useI18n();
	const thread = useEngine(
		"/tasks/:id/questions",
		{ query: { id: taskId } },
		{ enabled: taskId.length > 0 },
	);
	const ask = useEngineMutation("/tasks/:id/questions/create");
	const reply = useEngineMutation("/tasks/:id/answers/create");
	const decide = useEngineMutation("/tasks/:id/answers/decide");
	const [body, setBody] = useState("");
	const [answers, setAnswers] = useState<Record<string, string>>({});
	const [error, setError] = useState<string | null>(null);

	if (thread.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (thread.error || !thread.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const data = thread.data;
	const ready = body.trim() !== "";
	const firstReply = data.questions.find(
		(question) => (answers[question.id]?.trim() ?? "") !== "",
	)?.id;

	async function onAsk(event: FormEvent) {
		event.preventDefault();
		if (!ready) return;
		setError(null);
		try {
			await ask.mutateAsync({ body: { id: taskId, body: body.trim() } });
			setBody("");
			await invalidateEngine("/tasks/:id/questions");
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : t("tryAgain"));
		}
	}

	async function onReply(questionId: string) {
		const text = answers[questionId]?.trim() ?? "";
		if (!text) return;
		setError(null);
		try {
			await reply.mutateAsync({
				body: { id: taskId, questionId, body: text },
			});
			setAnswers((current) => ({ ...current, [questionId]: "" }));
			await invalidateEngine("/tasks/:id/questions");
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : t("tryAgain"));
		}
	}

	async function onDecide(answerId: string, shown: boolean) {
		setError(null);
		try {
			await decide.mutateAsync({ body: { id: taskId, answerId, shown } });
			await invalidateEngine("/tasks/:id/questions");
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : t("tryAgain"));
		}
	}

	return (
		<section className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-8">
			<div>
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{t("taskQuestionsTitle")}
				</h1>
				<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
					{t("taskQuestionsSentence")}
				</p>
			</div>
			{data.questions.length === 0 ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("taskQuestionsEmpty")}
				</p>
			) : (
				<ul className="flex flex-col gap-8">
					{data.questions.map((question) => (
						<li key={question.id} className="flex flex-col gap-3">
							<p className="font-sans text-lg font-semibold text-fg">
								{question.authorName}
							</p>
							<p className="font-sans text-lg text-fg">{question.body}</p>
							<ul className="flex flex-col gap-3 border-l border-line pl-4">
								{question.answers.map((answer) => (
									<li key={answer.id} className="flex flex-col gap-2">
										<p className="font-sans text-lg text-fg">{answer.body}</p>
										<p className="font-meta text-xs uppercase text-fg-muted">
											{answer.authorName}
										</p>
										{answer.status === "pending" ? (
											<Badge variant="pending" className="w-fit">
												{t("taskQuestionsWaiting")}
											</Badge>
										) : null}
										{data.canReview && !answer.mine ? (
											<div className="flex flex-wrap gap-3">
												<Button
													type="button"
													variant="quiet"
													onClick={() => void onDecide(answer.id, true)}
												>
													{t("taskQuestionsShow")}
												</Button>
												<Button
													type="button"
													variant="quiet"
													onClick={() => void onDecide(answer.id, false)}
												>
													{t("taskQuestionsHide")}
												</Button>
											</div>
										) : null}
									</li>
								))}
							</ul>
							{data.canAnswer ? (
								<div className="flex flex-col gap-2">
									<label
										className="flex flex-col gap-2"
										htmlFor={`reply-${question.id}`}
									>
										<span className="font-meta text-xs uppercase text-fg-muted">
											{t("taskQuestionsAnswer")}
										</span>
										<textarea
											id={`reply-${question.id}`}
											className="min-h-24 rounded-md border border-line bg-card px-3 py-2 font-sans text-lg text-fg"
											value={answers[question.id] ?? ""}
											onChange={(event) =>
												setAnswers((current) => ({
													...current,
													[question.id]: event.target.value,
												}))
											}
										/>
									</label>
									{(answers[question.id]?.trim() ?? "") !== "" ? (
										<Button
											type="button"
											variant={
												!data.canAsk && question.id === firstReply
													? "ink"
													: "quiet"
											}
											className="w-fit"
											onClick={() => void onReply(question.id)}
										>
											{t("taskQuestionsSaveAnswer")}
										</Button>
									) : null}
								</div>
							) : null}
						</li>
					))}
				</ul>
			)}
			{data.canAsk ? (
				<form
					className="flex flex-col gap-4"
					onSubmit={(event) => void onAsk(event)}
				>
					<label className="flex flex-col gap-2" htmlFor="task-question">
						<span className="font-meta text-xs uppercase text-fg-muted">
							{t("taskQuestionsBody")}
						</span>
						<textarea
							id="task-question"
							className="min-h-24 rounded-md border border-line bg-card px-3 py-2 font-sans text-lg text-fg"
							value={body}
							onChange={(event) => setBody(event.target.value)}
						/>
					</label>
					{ready ? (
						<Button type="submit" variant="ink" className="w-fit">
							{t("taskQuestionsAsk")}
						</Button>
					) : null}
				</form>
			) : null}
			{error ? (
				<p className="font-sans text-lg text-destructive">{error}</p>
			) : null}
		</section>
	);
}
