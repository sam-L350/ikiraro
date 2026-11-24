import { type FormEvent, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { invalidateEngine, useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

type ChoiceDraft = {
	key: string;
	labelEn: string;
	labelRw: string;
	courseId: string;
};

function titleFor(
	locale: "rw" | "en",
	item: { titleEn: string; titleRw: string },
): string {
	if (locale === "rw" && item.titleRw.trim()) return item.titleRw;
	if (item.titleEn.trim()) return item.titleEn;
	return item.titleRw;
}

function blankChoice(): ChoiceDraft {
	return { key: crypto.randomUUID(), labelEn: "", labelRw: "", courseId: "" };
}

export default function PlacementPage() {
	const { locale, t } = useI18n();
	const check = useEngine("/placement");
	const answer = useEngineMutation("/placement/answer");
	const create = useEngineMutation("/placement/questions/create");
	const [picks, setPicks] = useState<Record<string, string>>({});
	const [promptEn, setPromptEn] = useState("");
	const [promptRw, setPromptRw] = useState("");
	const [choices, setChoices] = useState<ChoiceDraft[]>([
		blankChoice(),
		blankChoice(),
	]);
	const [formError, setFormError] = useState<string | null>(null);

	if (check.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (check.error || !check.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const data = check.data;
	const questions = data.questions;
	const suggestion = data.suggestion;
	const answered =
		questions.length > 0 && questions.every((question) => picks[question.id]);
	const choiceReady = choices.every(
		(choice) =>
			choice.labelEn.trim() !== "" &&
			choice.labelRw.trim() !== "" &&
			choice.courseId !== "",
	);
	const questionReady =
		promptEn.trim() !== "" && promptRw.trim() !== "" && choiceReady;

	async function onAnswer(event: FormEvent) {
		event.preventDefault();
		if (!answered) return;
		setFormError(null);
		try {
			await answer.mutateAsync({
				body: {
					choiceIds: questions.map((question) => picks[question.id] ?? ""),
				},
			});
			await invalidateEngine("/placement");
		} catch (error) {
			setFormError(error instanceof Error ? error.message : t("tryAgain"));
		}
	}

	async function onCreate(event: FormEvent) {
		event.preventDefault();
		if (!questionReady) return;
		setFormError(null);
		try {
			await create.mutateAsync({
				body: {
					promptEn: promptEn.trim(),
					promptRw: promptRw.trim(),
					choices: choices.map((choice) => ({
						labelEn: choice.labelEn.trim(),
						labelRw: choice.labelRw.trim(),
						courseId: choice.courseId,
					})),
				},
			});
			setPromptEn("");
			setPromptRw("");
			setChoices([blankChoice(), blankChoice()]);
			await invalidateEngine("/placement");
			await invalidateEngine("/placement/questions");
		} catch (error) {
			setFormError(error instanceof Error ? error.message : t("tryAgain"));
		}
	}

	return (
		<section className="flex max-w-3xl flex-col gap-10">
			<div>
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{t("placementTitle")}
				</h1>
				<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
					{t("placementSentence")}
				</p>
			</div>
			{suggestion && !data.canWrite ? (
				<div className="flex flex-col items-start gap-4">
					<p className="font-sans text-lg font-medium text-fg">
						{t("placementSuggested", {
							course: titleFor(locale, suggestion),
						})}
					</p>
					<Button asChild variant="ink" className="w-fit">
						<Link to={`/catalog/${suggestion.courseId}`}>
							{t("pathwaysNext")}
						</Link>
					</Button>
				</div>
			) : null}
			{!data.canWrite && !suggestion && questions.length === 0 ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("placementEmpty")}
				</p>
			) : null}
			{!data.canWrite && !suggestion && questions.length > 0 ? (
				<form
					className="flex flex-col gap-6"
					onSubmit={(event) => void onAnswer(event)}
				>
					{questions.map((question) => (
						<fieldset
							key={question.id}
							className="flex flex-col gap-2 border-0 p-0"
						>
							<legend className="font-sans text-lg font-semibold text-fg">
								{titleFor(locale, {
									titleEn: question.promptEn,
									titleRw: question.promptRw,
								})}
							</legend>
							{question.choices.map((choice) => {
								const selected = picks[question.id] === choice.id;
								return (
									<button
										key={choice.id}
										type="button"
										aria-pressed={selected}
										className={
											selected
												? "min-h-16 rounded-md bg-ink px-4 text-left font-sans text-lg font-semibold text-ink-fg"
												: "min-h-16 rounded-md border border-line bg-card px-4 text-left font-sans text-lg font-medium text-fg"
										}
										onClick={() =>
											setPicks((current) => ({
												...current,
												[question.id]: choice.id,
											}))
										}
									>
										{titleFor(locale, {
											titleEn: choice.labelEn,
											titleRw: choice.labelRw,
										})}
									</button>
								);
							})}
						</fieldset>
					))}
					{answered ? (
						<Button type="submit" variant="ink" className="w-fit">
							{t("placementAnswer")}
						</Button>
					) : null}
				</form>
			) : null}
			{data.canWrite && questions.length > 0 ? (
				<ul className="flex flex-col gap-2">
					{questions.map((question) => (
						<li key={question.id} className="font-sans text-lg text-fg">
							{titleFor(locale, {
								titleEn: question.promptEn,
								titleRw: question.promptRw,
							})}
						</li>
					))}
				</ul>
			) : null}
			{data.canWrite ? (
				<form
					className="flex flex-col gap-4"
					onSubmit={(event) => void onCreate(event)}
				>
					<label className="flex flex-col gap-2" htmlFor="placement-en">
						<span className="font-meta text-xs uppercase text-fg-muted">
							{t("placementPromptEn")}
						</span>
						<Input
							id="placement-en"
							value={promptEn}
							onChange={(event) => setPromptEn(event.target.value)}
						/>
					</label>
					<label className="flex flex-col gap-2" htmlFor="placement-rw">
						<span className="font-meta text-xs uppercase text-fg-muted">
							{t("placementPromptRw")}
						</span>
						<Input
							id="placement-rw"
							value={promptRw}
							onChange={(event) => setPromptRw(event.target.value)}
						/>
					</label>
					{choices.map((choice, index) => (
						<div key={choice.key} className="flex flex-col gap-2">
							<label
								className="flex flex-col gap-2"
								htmlFor={`choice-en-${choice.key}`}
							>
								<span className="font-meta text-xs uppercase text-fg-muted">
									{t("placementChoiceEn")} {index + 1}
								</span>
								<Input
									id={`choice-en-${choice.key}`}
									value={choice.labelEn}
									onChange={(event) =>
										setChoices((current) =>
											current.map((item) =>
												item.key === choice.key
													? { ...item, labelEn: event.target.value }
													: item,
											),
										)
									}
								/>
							</label>
							<label
								className="flex flex-col gap-2"
								htmlFor={`choice-rw-${choice.key}`}
							>
								<span className="font-meta text-xs uppercase text-fg-muted">
									{t("placementChoiceRw")}
								</span>
								<Input
									id={`choice-rw-${choice.key}`}
									value={choice.labelRw}
									onChange={(event) =>
										setChoices((current) =>
											current.map((item) =>
												item.key === choice.key
													? { ...item, labelRw: event.target.value }
													: item,
											),
										)
									}
								/>
							</label>
							<label
								className="flex flex-col gap-2"
								htmlFor={`choice-course-${choice.key}`}
							>
								<span className="font-meta text-xs uppercase text-fg-muted">
									{t("placementCourse")}
								</span>
								<select
									id={`choice-course-${choice.key}`}
									className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
									value={choice.courseId}
									onChange={(event) =>
										setChoices((current) =>
											current.map((item) =>
												item.key === choice.key
													? { ...item, courseId: event.target.value }
													: item,
											),
										)
									}
								>
									<option value="">{t("placementCourse")}</option>
									{data.courses.map((course) => (
										<option key={course.id} value={course.id}>
											{titleFor(locale, course)}
										</option>
									))}
								</select>
							</label>
						</div>
					))}
					<Button
						type="button"
						variant="quiet"
						className="w-fit"
						onClick={() => setChoices((current) => [...current, blankChoice()])}
					>
						{t("placementAddChoice")}
					</Button>
					{questionReady ? (
						<Button type="submit" variant="ink" className="w-fit">
							{t("placementSave")}
						</Button>
					) : null}
				</form>
			) : null}
			{formError ? (
				<p className="font-sans text-lg text-destructive">{formError}</p>
			) : null}
		</section>
	);
}
