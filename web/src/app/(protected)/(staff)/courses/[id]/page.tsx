import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

type Course = {
	id: string;
	status: ContentStatus;
	titleEn: string;
	titleRw: string;
	summaryEn: string;
	summaryRw: string;
	missingKinyarwanda: boolean;
	modules: Module[];
};

const fieldClass = "h-11 focus:border-ink focus:ring-ink/40";

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

function reasonKey(error: unknown): MessageKey {
	if (!isApiClientError(error)) return "tryAgain";
	const reason = (error.details as { reason?: string } | undefined)?.reason;
	switch (reason) {
		case "title_required":
			return "titleRequired";
		case "incomplete":
			return "reviewIncomplete";
		case "not_draft":
			return "courseInReview";
		case "unknown_evidence":
			return "unknownEvidence";
		case "weight_required":
			return "weightRequired";
		default:
			return "tryAgain";
	}
}

function Label({ htmlFor, children }: { htmlFor: string; children: string }) {
	return (
		<label className="flex flex-col gap-2" htmlFor={htmlFor}>
			<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
				{children}
			</span>
		</label>
	);
}

function Fallback({ show }: { show: boolean }) {
	const { t } = useI18n();
	if (!show) return null;
	return (
		<p className="font-sans text-sm text-fg-muted">{t("englishFallback")}</p>
	);
}

export default function CourseEditorPage() {
	const { t } = useI18n();
	const params = useParams();
	const id = params.id ?? "";
	const course = useEngine(
		"/courses/:id",
		{ query: { id } },
		{ enabled: id.length > 0 },
	);
	const review = useEngineMutation("/courses/:id/review");
	const [dirty, setDirty] = useState<Record<string, boolean>>({});
	const [error, setError] = useState<MessageKey | null>(null);
	const mark = useCallback((key: string, value: boolean) => {
		setDirty((current) => {
			if (current[key] === value) return current;
			return { ...current, [key]: value };
		});
	}, []);

	if (course.isLoading) {
		return <div className="h-8 w-48 animate-pulse rounded-full bg-surface" />;
	}
	if (!course.data) {
		return (
			<p className="font-sans text-lg font-medium text-fg">{t("tryAgain")}</p>
		);
	}

	const draft = course.data;
	const editable = draft.status === "draft";
	const unsaved = Object.values(dirty).some(Boolean);

	async function onReview() {
		setError(null);
		try {
			await review.mutateAsync({ body: { id: draft.id } });
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
			{draft.status === "in_review" ? (
				<p className="mt-4 font-sans text-lg font-medium text-fg">
					{t("courseInReview")}
				</p>
			) : null}
			<div className="mt-8 flex flex-col gap-10">
				<CourseFields
					course={draft}
					editable={editable}
					onDirty={mark}
					onSaved={() => course.invalidate()}
				/>
				{draft.modules.map((module) => (
					<ModuleFields
						key={module.id}
						module={module}
						editable={editable}
						onDirty={mark}
						onSaved={() => course.invalidate()}
					/>
				))}
				{editable ? (
					<AddModule courseId={draft.id} onSaved={() => course.invalidate()} />
				) : null}
			</div>
			{editable ? (
				<div className="mt-10 flex flex-col items-start gap-3">
					{unsaved ? (
						<p className="font-sans text-sm text-fg-muted">
							{t("saveBeforeReview")}
						</p>
					) : null}
					{error ? (
						<p
							className="font-sans text-sm font-medium text-danger"
							role="alert"
						>
							{t(error)}
						</p>
					) : null}
					<Button
						type="button"
						variant="sticker"
						disabled={unsaved || review.isPending}
						onClick={() => void onReview()}
					>
						{t("submitForReview")}
					</Button>
				</div>
			) : null}
		</section>
	);
}

function CourseFields({
	course,
	editable,
	onDirty,
	onSaved,
}: {
	course: Course;
	editable: boolean;
	onDirty: (key: string, dirty: boolean) => void;
	onSaved: () => Promise<void>;
}) {
	const { t } = useI18n();
	const save = useEngineMutation("/courses/:id/update");
	const [titleEn, setTitleEn] = useState(course.titleEn);
	const [titleRw, setTitleRw] = useState(course.titleRw);
	const [summaryEn, setSummaryEn] = useState(course.summaryEn);
	const [summaryRw, setSummaryRw] = useState(course.summaryRw);
	const [error, setError] = useState<MessageKey | null>(null);
	const dirty =
		titleEn !== course.titleEn ||
		titleRw !== course.titleRw ||
		summaryEn !== course.summaryEn ||
		summaryRw !== course.summaryRw;
	useEffect(() => {
		onDirty(course.id, dirty);
	}, [course.id, dirty, onDirty]);

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		try {
			await save.mutateAsync({
				body: { id: course.id, titleEn, titleRw, summaryEn, summaryRw },
			});
			await onSaved();
		} catch (caught) {
			setError(reasonKey(caught));
		}
	}

	return (
		<form className="flex flex-col gap-4" onSubmit={onSubmit}>
			<Field
				id={`${course.id}-title-en`}
				label={t("courseTitleEn")}
				value={titleEn}
				disabled={!editable}
				onChange={setTitleEn}
			/>
			<Field
				id={`${course.id}-title-rw`}
				label={t("courseTitleRw")}
				value={titleRw}
				disabled={!editable}
				onChange={setTitleRw}
				hint={titleEn.trim().length > 0 && titleRw.trim().length === 0}
			/>
			<Field
				id={`${course.id}-summary-en`}
				label={t("courseSummaryEn")}
				value={summaryEn}
				disabled={!editable}
				onChange={setSummaryEn}
			/>
			<Field
				id={`${course.id}-summary-rw`}
				label={t("courseSummaryRw")}
				value={summaryRw}
				disabled={!editable}
				onChange={setSummaryRw}
				hint={summaryEn.trim().length > 0 && summaryRw.trim().length === 0}
			/>
			{error ? <Alert message={t(error)} /> : null}
			{editable ? (
				<div>
					<Button
						type="submit"
						variant="soft"
						disabled={save.isPending || !dirty}
					>
						{t("saveDraft")}
					</Button>
				</div>
			) : null}
		</form>
	);
}

function ModuleFields({
	module,
	editable,
	onDirty,
	onSaved,
}: {
	module: Module;
	editable: boolean;
	onDirty: (key: string, dirty: boolean) => void;
	onSaved: () => Promise<void>;
}) {
	const { t } = useI18n();
	const save = useEngineMutation("/modules/:id/update");
	const [titleEn, setTitleEn] = useState(module.titleEn);
	const [titleRw, setTitleRw] = useState(module.titleRw);
	const [summaryEn, setSummaryEn] = useState(module.summaryEn);
	const [summaryRw, setSummaryRw] = useState(module.summaryRw);
	const [error, setError] = useState<MessageKey | null>(null);
	const dirty =
		titleEn !== module.titleEn ||
		titleRw !== module.titleRw ||
		summaryEn !== module.summaryEn ||
		summaryRw !== module.summaryRw;
	useEffect(() => {
		onDirty(module.id, dirty);
	}, [module.id, dirty, onDirty]);

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		try {
			await save.mutateAsync({
				body: { id: module.id, titleEn, titleRw, summaryEn, summaryRw },
			});
			await onSaved();
		} catch (caught) {
			setError(reasonKey(caught));
		}
	}

	return (
		<section className="border-t border-ink/15 pt-8">
			<h2 className="font-sans text-2xl font-semibold text-fg">
				{t("moduleLabel")}
			</h2>
			<form className="mt-4 flex flex-col gap-4" onSubmit={onSubmit}>
				<Field
					id={`${module.id}-title-en`}
					label={t("courseTitleEn")}
					value={titleEn}
					disabled={!editable}
					onChange={setTitleEn}
				/>
				<Field
					id={`${module.id}-title-rw`}
					label={t("courseTitleRw")}
					value={titleRw}
					disabled={!editable}
					onChange={setTitleRw}
					hint={titleEn.trim().length > 0 && titleRw.trim().length === 0}
				/>
				<Field
					id={`${module.id}-summary-en`}
					label={t("courseSummaryEn")}
					value={summaryEn}
					disabled={!editable}
					onChange={setSummaryEn}
				/>
				<Field
					id={`${module.id}-summary-rw`}
					label={t("courseSummaryRw")}
					value={summaryRw}
					disabled={!editable}
					onChange={setSummaryRw}
					hint={summaryEn.trim().length > 0 && summaryRw.trim().length === 0}
				/>
				{error ? <Alert message={t(error)} /> : null}
				{editable ? (
					<div>
						<Button
							type="submit"
							variant="soft"
							disabled={save.isPending || !dirty}
						>
							{t("saveDraft")}
						</Button>
					</div>
				) : null}
			</form>
			<div className="mt-8 flex flex-col gap-8">
				{module.tasks.map((task) => (
					<TaskFields
						key={task.id}
						task={task}
						editable={editable}
						onDirty={onDirty}
						onSaved={onSaved}
					/>
				))}
				{editable ? <AddTask moduleId={module.id} onSaved={onSaved} /> : null}
			</div>
		</section>
	);
}

function TaskFields({
	task,
	editable,
	onDirty,
	onSaved,
}: {
	task: Task;
	editable: boolean;
	onDirty: (key: string, dirty: boolean) => void;
	onSaved: () => Promise<void>;
}) {
	const { t } = useI18n();
	const save = useEngineMutation("/tasks/:id/update");
	const [titleEn, setTitleEn] = useState(task.titleEn);
	const [titleRw, setTitleRw] = useState(task.titleRw);
	const [instructionsEn, setInstructionsEn] = useState(task.instructionsEn);
	const [instructionsRw, setInstructionsRw] = useState(task.instructionsRw);
	const [evidenceType, setEvidenceType] = useState(task.evidenceType ?? "");
	const [error, setError] = useState<MessageKey | null>(null);
	const dirty =
		titleEn !== task.titleEn ||
		titleRw !== task.titleRw ||
		instructionsEn !== task.instructionsEn ||
		instructionsRw !== task.instructionsRw ||
		evidenceType !== (task.evidenceType ?? "");
	useEffect(() => {
		onDirty(task.id, dirty);
	}, [task.id, dirty, onDirty]);

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		try {
			await save.mutateAsync({
				body: {
					id: task.id,
					titleEn,
					titleRw,
					instructionsEn,
					instructionsRw,
					evidenceType,
				},
			});
			await onSaved();
		} catch (caught) {
			setError(reasonKey(caught));
		}
	}

	return (
		<section className="rounded-[20px] bg-surface p-5">
			<h3 className="font-sans text-xl font-semibold text-fg">
				{t("taskLabel")}
			</h3>
			<form className="mt-4 flex flex-col gap-4" onSubmit={onSubmit}>
				<Field
					id={`${task.id}-title-en`}
					label={t("courseTitleEn")}
					value={titleEn}
					disabled={!editable}
					onChange={setTitleEn}
				/>
				<Field
					id={`${task.id}-title-rw`}
					label={t("courseTitleRw")}
					value={titleRw}
					disabled={!editable}
					onChange={setTitleRw}
					hint={titleEn.trim().length > 0 && titleRw.trim().length === 0}
				/>
				<TextField
					id={`${task.id}-instructions-en`}
					label={t("instructionsEn")}
					value={instructionsEn}
					disabled={!editable}
					onChange={setInstructionsEn}
				/>
				<TextField
					id={`${task.id}-instructions-rw`}
					label={t("instructionsRw")}
					value={instructionsRw}
					disabled={!editable}
					onChange={setInstructionsRw}
					hint={
						instructionsEn.trim().length > 0 &&
						instructionsRw.trim().length === 0
					}
				/>
				<label className="flex flex-col gap-2" htmlFor={`${task.id}-evidence`}>
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("evidenceType")}
					</span>
					<select
						id={`${task.id}-evidence`}
						className="h-11 rounded-xl border border-ink/15 bg-canvas px-3 font-sans text-fg"
						value={evidenceType}
						disabled={!editable}
						onChange={(event) => setEvidenceType(event.target.value)}
					>
						<option value="">{t("evidenceType")}</option>
						<option value="photo">{t("evidencePhoto")}</option>
						<option value="file">{t("evidenceFile")}</option>
						<option value="note">{t("evidenceNote")}</option>
					</select>
				</label>
				{error ? <Alert message={t(error)} /> : null}
				{editable ? (
					<div>
						<Button
							type="submit"
							variant="soft"
							disabled={save.isPending || !dirty}
						>
							{t("saveDraft")}
						</Button>
					</div>
				) : null}
			</form>
			<div className="mt-6 flex flex-col gap-4">
				<p className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
					{t("rubricLabel")}
				</p>
				{task.criteria.map((criterion) => (
					<CriterionFields
						key={criterion.id}
						criterion={criterion}
						editable={editable}
						onDirty={onDirty}
						onSaved={onSaved}
					/>
				))}
				{editable ? <AddCriterion taskId={task.id} onSaved={onSaved} /> : null}
			</div>
		</section>
	);
}

function CriterionFields({
	criterion,
	editable,
	onDirty,
	onSaved,
}: {
	criterion: Criterion;
	editable: boolean;
	onDirty: (key: string, dirty: boolean) => void;
	onSaved: () => Promise<void>;
}) {
	const { t } = useI18n();
	const save = useEngineMutation("/criteria/:id/update");
	const [weight, setWeight] = useState(String(criterion.weight));
	const [promptEn, setPromptEn] = useState(criterion.promptEn);
	const [promptRw, setPromptRw] = useState(criterion.promptRw);
	const [error, setError] = useState<MessageKey | null>(null);
	const dirty =
		weight !== String(criterion.weight) ||
		promptEn !== criterion.promptEn ||
		promptRw !== criterion.promptRw;
	useEffect(() => {
		onDirty(criterion.id, dirty);
	}, [criterion.id, dirty, onDirty]);

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		try {
			await save.mutateAsync({
				body: {
					id: criterion.id,
					weight: Number(weight),
					promptEn,
					promptRw,
				},
			});
			await onSaved();
		} catch (caught) {
			setError(reasonKey(caught));
		}
	}

	return (
		<form
			className="flex flex-col gap-4 border-t border-ink/15 pt-4"
			onSubmit={onSubmit}
		>
			<Field
				id={`${criterion.id}-weight`}
				label={t("weightLabel")}
				value={weight}
				disabled={!editable}
				onChange={setWeight}
			/>
			<Field
				id={`${criterion.id}-prompt-en`}
				label={t("promptEn")}
				value={promptEn}
				disabled={!editable}
				onChange={setPromptEn}
			/>
			<Field
				id={`${criterion.id}-prompt-rw`}
				label={t("promptRw")}
				value={promptRw}
				disabled={!editable}
				onChange={setPromptRw}
				hint={promptEn.trim().length > 0 && promptRw.trim().length === 0}
			/>
			{error ? <Alert message={t(error)} /> : null}
			{editable ? (
				<div>
					<Button
						type="submit"
						variant="soft"
						disabled={save.isPending || !dirty}
					>
						{t("saveDraft")}
					</Button>
				</div>
			) : null}
		</form>
	);
}

function AddModule({
	courseId,
	onSaved,
}: {
	courseId: string;
	onSaved: () => Promise<void>;
}) {
	const { t } = useI18n();
	const create = useEngineMutation("/courses/:id/modules");
	const [titleEn, setTitleEn] = useState("");
	const [titleRw, setTitleRw] = useState("");
	const [error, setError] = useState<MessageKey | null>(null);

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		try {
			await create.mutateAsync({ body: { id: courseId, titleEn, titleRw } });
			setTitleEn("");
			setTitleRw("");
			await onSaved();
		} catch (caught) {
			setError(reasonKey(caught));
		}
	}

	return (
		<form
			className="flex flex-col gap-4 border-t border-ink/15 pt-8"
			onSubmit={onSubmit}
		>
			<h2 className="font-sans text-2xl font-semibold text-fg">
				{t("addModule")}
			</h2>
			<Field
				id={`${courseId}-new-module-en`}
				label={t("courseTitleEn")}
				value={titleEn}
				onChange={setTitleEn}
			/>
			<Field
				id={`${courseId}-new-module-rw`}
				label={t("courseTitleRw")}
				value={titleRw}
				onChange={setTitleRw}
				hint={titleEn.trim().length > 0 && titleRw.trim().length === 0}
			/>
			{error ? <Alert message={t(error)} /> : null}
			<div>
				<Button type="submit" variant="soft" disabled={create.isPending}>
					{t("addModule")}
				</Button>
			</div>
		</form>
	);
}

function AddTask({
	moduleId,
	onSaved,
}: {
	moduleId: string;
	onSaved: () => Promise<void>;
}) {
	const { t } = useI18n();
	const create = useEngineMutation("/modules/:id/tasks");
	const [titleEn, setTitleEn] = useState("");
	const [titleRw, setTitleRw] = useState("");
	const [error, setError] = useState<MessageKey | null>(null);

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		try {
			await create.mutateAsync({ body: { id: moduleId, titleEn, titleRw } });
			setTitleEn("");
			setTitleRw("");
			await onSaved();
		} catch (caught) {
			setError(reasonKey(caught));
		}
	}

	return (
		<form className="flex flex-col gap-4" onSubmit={onSubmit}>
			<Field
				id={`${moduleId}-new-task-en`}
				label={t("courseTitleEn")}
				value={titleEn}
				onChange={setTitleEn}
			/>
			<Field
				id={`${moduleId}-new-task-rw`}
				label={t("courseTitleRw")}
				value={titleRw}
				onChange={setTitleRw}
				hint={titleEn.trim().length > 0 && titleRw.trim().length === 0}
			/>
			{error ? <Alert message={t(error)} /> : null}
			<div>
				<Button type="submit" variant="soft" disabled={create.isPending}>
					{t("addTask")}
				</Button>
			</div>
		</form>
	);
}

function AddCriterion({
	taskId,
	onSaved,
}: {
	taskId: string;
	onSaved: () => Promise<void>;
}) {
	const { t } = useI18n();
	const create = useEngineMutation("/tasks/:id/criteria");
	const [weight, setWeight] = useState("1");
	const [promptEn, setPromptEn] = useState("");
	const [promptRw, setPromptRw] = useState("");
	const [error, setError] = useState<MessageKey | null>(null);

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		try {
			await create.mutateAsync({
				body: { id: taskId, weight: Number(weight), promptEn, promptRw },
			});
			setPromptEn("");
			setPromptRw("");
			await onSaved();
		} catch (caught) {
			setError(reasonKey(caught));
		}
	}

	return (
		<form className="flex flex-col gap-4" onSubmit={onSubmit}>
			<Field
				id={`${taskId}-new-weight`}
				label={t("weightLabel")}
				value={weight}
				onChange={setWeight}
			/>
			<Field
				id={`${taskId}-new-prompt-en`}
				label={t("promptEn")}
				value={promptEn}
				onChange={setPromptEn}
			/>
			<Field
				id={`${taskId}-new-prompt-rw`}
				label={t("promptRw")}
				value={promptRw}
				onChange={setPromptRw}
				hint={promptEn.trim().length > 0 && promptRw.trim().length === 0}
			/>
			{error ? <Alert message={t(error)} /> : null}
			<div>
				<Button type="submit" variant="soft" disabled={create.isPending}>
					{t("addCriterion")}
				</Button>
			</div>
		</form>
	);
}

function Field({
	id,
	label,
	value,
	onChange,
	disabled,
	hint,
}: {
	id: string;
	label: string;
	value: string;
	onChange: (value: string) => void;
	disabled?: boolean;
	hint?: boolean;
}) {
	return (
		<div className="flex flex-col gap-2">
			<Label htmlFor={id}>{label}</Label>
			<Input
				id={id}
				className={fieldClass}
				value={value}
				disabled={disabled}
				onChange={(event) => onChange(event.target.value)}
			/>
			<Fallback show={hint === true} />
		</div>
	);
}

function TextField({
	id,
	label,
	value,
	onChange,
	disabled,
	hint,
}: {
	id: string;
	label: string;
	value: string;
	onChange: (value: string) => void;
	disabled?: boolean;
	hint?: boolean;
}) {
	return (
		<div className="flex flex-col gap-2">
			<Label htmlFor={id}>{label}</Label>
			<textarea
				id={id}
				className="min-h-28 w-full rounded-xl border border-line-strong bg-surface px-3.5 py-3 font-sans text-sm text-fg focus:border-ink focus:outline-none focus:ring-3 focus:ring-ink/40 disabled:opacity-50"
				value={value}
				disabled={disabled}
				onChange={(event) => onChange(event.target.value)}
			/>
			<Fallback show={hint === true} />
		</div>
	);
}

function Alert({ message }: { message: string }) {
	return (
		<p className="font-sans text-sm font-medium text-danger" role="alert">
			{message}
		</p>
	);
}
