import { type FormEvent, useState } from "react";
import { useParams } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isApiClientError, useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";

type ContentStatus = "draft" | "in_review" | "published" | "retired";

type Criterion = {
	id: string;
	weight: number;
	promptEn: string;
	promptRw: string;
	missingKinyarwanda: boolean;
};

type Task = {
	id: string;
	titleEn: string;
	titleRw: string;
	instructionsEn: string;
	instructionsRw: string;
	evidenceType: string | null;
	missingKinyarwanda: boolean;
	criteria: Criterion[];
};

type Module = {
	id: string;
	titleEn: string;
	titleRw: string;
	summaryEn: string;
	summaryRw: string;
	missingKinyarwanda: boolean;
	tasks: Task[];
};

type ReviewCourse = {
	id: string;
	status: ContentStatus;
	titleEn: string;
	titleRw: string;
	summaryEn: string;
	summaryRw: string;
	missingKinyarwanda: boolean;
	reviewNote: string;
	approved: boolean;
	ownCourse: boolean;
	modules: Module[];
};

type Decision = "approve" | "publish" | "retire" | "none";

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

function decisionOf(course: ReviewCourse): Decision {
	switch (course.status) {
		case "in_review":
			if (course.ownCourse) return "none";
			return course.approved ? "publish" : "approve";
		case "published":
			return "retire";
		case "draft":
		case "retired":
			return "none";
		default: {
			const unreachable: never = course.status;
			return unreachable;
		}
	}
}

function decisionLabel(decision: Exclude<Decision, "none">): MessageKey {
	switch (decision) {
		case "approve":
			return "approveCourse";
		case "publish":
			return "publishCourse";
		case "retire":
			return "retireCourse";
		default: {
			const unreachable: never = decision;
			return unreachable;
		}
	}
}

function reasonKey(error: unknown): MessageKey {
	if (!isApiClientError(error)) return "tryAgain";
	const reason = (error.details as { reason?: string } | undefined)?.reason;
	switch (reason) {
		case "own_course":
			return "ownCourse";
		case "not_approved":
			return "notApproved";
		case "not_in_review":
			return "notInReview";
		case "not_published":
			return "notPublished";
		case "already_approved":
			return "alreadyApproved";
		case "reason_required":
			return "reasonRequired";
		default:
			return "tryAgain";
	}
}

function evidenceLabel(
	value: string | null,
	t: (key: MessageKey) => string,
): string {
	switch (value) {
		case "photo":
			return t("evidencePhoto");
		case "file":
			return t("evidenceFile");
		case "note":
			return t("evidenceNote");
		case "voice":
			return t("evidenceVoice");
		case null:
		case "":
			return t("evidenceType");
		default:
			return value;
	}
}

function Line({ label, value }: { label: string; value: string }) {
	if (!value) return null;
	return (
		<div>
			<p className="font-meta text-xs font-semibold uppercase tracking-wide text-fg-muted">
				{label}
			</p>
			<p className="mt-1 font-sans text-lg font-medium text-fg">{value}</p>
		</div>
	);
}

export default function ReviewCoursePage() {
	const { t } = useI18n();
	const params = useParams();
	const id = params.id ?? "";
	const course = useEngine(
		"/reviews/:id",
		{ query: { id } },
		{ enabled: id.length > 0 },
	);
	const approve = useEngineMutation("/reviews/:id/approve");
	const publish = useEngineMutation("/reviews/:id/publish");
	const retire = useEngineMutation("/reviews/:id/retire");
	const sendBack = useEngineMutation("/reviews/:id/return");
	const [note, setNote] = useState("");
	const [error, setError] = useState<MessageKey | null>(null);

	if (course.isLoading) {
		return <div className="h-8 w-48 animate-pulse rounded-full bg-surface" />;
	}
	if (!course.data) {
		return (
			<p className="font-sans text-lg font-medium text-fg">{t("tryAgain")}</p>
		);
	}

	const draft = course.data;
	const decision = decisionOf(draft);
	const pending =
		approve.isPending ||
		publish.isPending ||
		retire.isPending ||
		sendBack.isPending;

	async function onDecide() {
		setError(null);
		try {
			const body = { id: draft.id };
			switch (decision) {
				case "approve":
					await approve.mutateAsync({ body });
					break;
				case "publish":
					await publish.mutateAsync({ body });
					break;
				case "retire":
					await retire.mutateAsync({ body });
					break;
				case "none":
					return;
				default: {
					const unreachable: never = decision;
					return unreachable;
				}
			}
			await course.invalidate();
		} catch (caught) {
			setError(reasonKey(caught));
		}
	}

	async function onReturn(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		try {
			await sendBack.mutateAsync({ body: { id: draft.id, note } });
			setNote("");
			await course.invalidate();
		} catch (caught) {
			setError(reasonKey(caught));
		}
	}

	return (
		<section className="max-w-3xl">
			<div className="flex flex-wrap items-center gap-3">
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{draft.titleEn || draft.titleRw}
				</h1>
				<Badge variant="neutral">{t(statusKey(draft.status))}</Badge>
				{draft.missingKinyarwanda ? (
					<Badge variant="pending">{t("englishFallback")}</Badge>
				) : null}
			</div>
			{draft.ownCourse && draft.status === "in_review" ? (
				<p className="mt-4 font-sans text-lg font-medium text-fg">
					{t("ownCourse")}
				</p>
			) : null}
			{draft.status === "in_review" && draft.approved && !draft.ownCourse ? (
				<p className="mt-4 font-sans text-lg font-medium text-fg">
					{t("courseApproved")}
				</p>
			) : null}
			{draft.status === "published" ? (
				<p className="mt-4 font-sans text-lg font-medium text-fg">
					{t("coursePublishedSentence")}
				</p>
			) : null}
			{draft.status === "retired" ? (
				<p className="mt-4 font-sans text-lg font-medium text-fg">
					{t("courseRetiredSentence")}
				</p>
			) : null}
			{draft.reviewNote ? (
				<p className="mt-4 font-sans text-lg font-medium text-fg">
					{t("reviewReturnedNote")} {draft.reviewNote}
				</p>
			) : null}

			<div className="mt-8 flex flex-col gap-8">
				<Line label={t("courseSummaryEn")} value={draft.summaryEn} />
				<Line label={t("courseSummaryRw")} value={draft.summaryRw} />
				{draft.modules.map((module) => (
					<section key={module.id}>
						<h2 className="font-sans text-2xl font-semibold text-fg">
							{module.titleEn || module.titleRw}
						</h2>
						<div className="mt-4 flex flex-col gap-6">
							{module.tasks.map((task) => (
								<article key={task.id} className="border-t border-ink/15 pt-4">
									<h3 className="font-sans text-lg font-semibold text-fg">
										{task.titleEn || task.titleRw}
									</h3>
									<div className="mt-4 flex flex-col gap-4">
										<Line
											label={t("instructionsEn")}
											value={task.instructionsEn}
										/>
										<Line
											label={t("instructionsRw")}
											value={task.instructionsRw}
										/>
										<Line
											label={t("evidenceType")}
											value={evidenceLabel(task.evidenceType, t)}
										/>
										{task.criteria.length > 0 ? (
											<div>
												<p className="font-meta text-xs font-semibold uppercase tracking-wide text-fg-muted">
													{t("rubricLabel")}
												</p>
												<ul className="mt-2 flex flex-col gap-2">
													{task.criteria.map((criterion) => (
														<li
															key={criterion.id}
															className="font-sans text-lg font-medium text-fg"
														>
															{criterion.promptEn || criterion.promptRw}
															<span className="ml-2 font-meta text-xs uppercase tracking-wide text-fg-muted">
																{criterion.weight}
															</span>
														</li>
													))}
												</ul>
											</div>
										) : null}
									</div>
								</article>
							))}
						</div>
					</section>
				))}
			</div>

			{draft.status === "in_review" ? (
				<form className="mt-10 flex flex-col gap-3" onSubmit={onReturn}>
					<label className="flex flex-col gap-2" htmlFor="return-note">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("returnNoteLabel")}
						</span>
						<textarea
							id="return-note"
							className="min-h-28 w-full rounded-xl border border-line-strong bg-surface px-3.5 py-3 font-sans text-sm text-fg focus:border-ink focus:outline-none focus:ring-3 focus:ring-ink/40"
							value={note}
							onChange={(event) => setNote(event.target.value)}
						/>
					</label>
					<Button type="submit" variant="quiet" disabled={pending}>
						{t("sendBack")}
					</Button>
				</form>
			) : null}

			<div className="mt-8 flex flex-col items-start gap-3">
				{error ? (
					<p className="font-sans text-sm font-medium text-danger" role="alert">
						{t(error)}
					</p>
				) : null}
				{decision === "none" ? null : (
					<Button
						type="button"
						variant="sticker"
						disabled={pending}
						onClick={() => void onDecide()}
					>
						{t(decisionLabel(decision))}
					</Button>
				)}
			</div>
		</section>
	);
}
