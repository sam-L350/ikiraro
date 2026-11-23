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
	passThreshold: number;
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
	passThreshold: number;
	required: boolean;
	imageKey: string;
	audioKey: string;
	jobAidKey: string;
	outboundUrl: string;
	missingKinyarwanda: boolean;
	criteria: Criterion[];
};

type BadgeRule = {
	allRequiredTasksApproved: boolean;
	minimumScore: number | null;
	minimumHours: number | null;
};

type CourseBadge = {
	titleEn: string;
	titleRw: string;
	skillEn: string;
	skillRw: string;
	level: number;
	missingKinyarwanda: boolean;
	requiresInPerson?: boolean;
	rule: BadgeRule;
};

type Module = {
	id: string;
	titleEn: string;
	titleRw: string;
	summaryEn: string;
	summaryRw: string;
	missingKinyarwanda: boolean;
	requires: string[];
	tasks: Task[];
};

type Course = {
	id: string;
	status: ContentStatus;
	titleEn: string;
	titleRw: string;
	summaryEn: string;
	summaryRw: string;
	category: string;
	economicSector: string;
	level: number;
	missingKinyarwanda: boolean;
	badge: CourseBadge | null;
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
		case "invalid_media_key":
			return "invalidMediaKey";
		case "invalid_outbound_url":
			return "invalidOutboundUrl";
		case "invalid_threshold":
			return "invalidThreshold";
		case "invalid_hours":
			return "invalidHours";
		case "invalid_level":
			return "invalidLevel";
		case "not_published":
			return "nextDraftPublishedOnly";
		case "not_earlier":
			return "notEarlier";
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
	const clarity = useEngine(
		"/courses/:id/clarity",
		{ query: { id } },
		{ enabled: id.length > 0 },
	);
	const review = useEngineMutation("/courses/:id/review");
	const nextDraft = useEngineMutation("/courses/:id/draft");
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
	const clarityCounts = new Map(
		(clarity.data?.tasks ?? []).map((row) => [row.taskId, row]),
	);
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

	async function onNextDraft() {
		setError(null);
		try {
			await nextDraft.mutateAsync({ body: { id: draft.id } });
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
			{draft.reviewNote ? (
				<p className="mt-4 font-sans text-lg font-medium text-fg">
					{t("reviewReturnedNote")} {draft.reviewNote}
				</p>
			) : null}
			{draft.status === "in_review" ? (
				<p className="mt-4 font-sans text-lg font-medium text-fg">
					{t("courseInReview")}
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
			<div className="mt-8 flex flex-col gap-10">
				<CourseFields
					course={draft}
					editable={editable}
					onDirty={mark}
					onSaved={() => course.invalidate()}
				/>
				<BadgeFields
					courseId={draft.id}
					badge={draft.badge}
					editable={editable}
					onDirty={mark}
					onSaved={() => course.invalidate()}
				/>
				{draft.modules.map((module, index) => (
					<ModuleFields
						key={module.id}
						module={module}
						earlier={draft.modules.slice(0, index).map((item) => ({
							id: item.id,
							title: item.titleEn || item.titleRw,
						}))}
						editable={editable}
						clarity={clarityCounts}
						onDirty={mark}
						onSaved={() => course.invalidate()}
					/>
				))}
				{editable ? (
					<AddModule courseId={draft.id} onSaved={() => course.invalidate()} />
				) : null}
			</div>
			{draft.status === "published" ? (
				<div className="mt-10 flex flex-col items-start gap-3">
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
						disabled={nextDraft.isPending}
						onClick={() => void onNextDraft()}
					>
						{t("startNextDraft")}
					</Button>
				</div>
			) : null}
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
	const [category, setCategory] = useState(course.category);
	const [economicSector, setEconomicSector] = useState(course.economicSector);
	const [level, setLevel] = useState(String(course.level));
	const [error, setError] = useState<MessageKey | null>(null);
	const dirty =
		titleEn !== course.titleEn ||
		titleRw !== course.titleRw ||
		summaryEn !== course.summaryEn ||
		summaryRw !== course.summaryRw ||
		category !== course.category ||
		economicSector !== course.economicSector ||
		level !== String(course.level);
	useEffect(() => {
		onDirty(course.id, dirty);
	}, [course.id, dirty, onDirty]);

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		const parsedLevel = Number(level);
		if (!Number.isInteger(parsedLevel) || parsedLevel < 1) {
			setError("invalidLevel");
			return;
		}
		try {
			await save.mutateAsync({
				body: {
					id: course.id,
					titleEn,
					titleRw,
					summaryEn,
					summaryRw,
					category,
					economicSector,
					level: parsedLevel,
				},
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
			<Field
				id={`${course.id}-category`}
				label={t("courseCategory")}
				value={category}
				disabled={!editable}
				onChange={setCategory}
			/>
			<Field
				id={`${course.id}-sector`}
				label={t("courseSector")}
				value={economicSector}
				disabled={!editable}
				onChange={setEconomicSector}
			/>
			<Field
				id={`${course.id}-level`}
				label={t("courseLevel")}
				value={level}
				disabled={!editable}
				onChange={setLevel}
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

function sameIds(left: readonly string[], right: readonly string[]): boolean {
	if (left.length !== right.length) return false;
	const sortedLeft = [...left].sort();
	const sortedRight = [...right].sort();
	return sortedLeft.every((id, index) => id === sortedRight[index]);
}

function ModuleFields({
	module,
	earlier,
	editable,
	clarity,
	onDirty,
	onSaved,
}: {
	module: Module;
	earlier: { id: string; title: string }[];
	editable: boolean;
	clarity: Map<string, { clear: number; hard: number }>;
	onDirty: (key: string, dirty: boolean) => void;
	onSaved: () => Promise<void>;
}) {
	const { t } = useI18n();
	const save = useEngineMutation("/modules/:id/update");
	const [titleEn, setTitleEn] = useState(module.titleEn);
	const [titleRw, setTitleRw] = useState(module.titleRw);
	const [summaryEn, setSummaryEn] = useState(module.summaryEn);
	const [summaryRw, setSummaryRw] = useState(module.summaryRw);
	const [requires, setRequires] = useState(module.requires);
	const [error, setError] = useState<MessageKey | null>(null);
	const dirty =
		titleEn !== module.titleEn ||
		titleRw !== module.titleRw ||
		summaryEn !== module.summaryEn ||
		summaryRw !== module.summaryRw ||
		!sameIds(requires, module.requires);
	useEffect(() => {
		onDirty(module.id, dirty);
	}, [module.id, dirty, onDirty]);

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		try {
			await save.mutateAsync({
				body: {
					id: module.id,
					titleEn,
					titleRw,
					summaryEn,
					summaryRw,
					requires,
				},
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
				<fieldset className="flex flex-col gap-2">
					<legend className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("requiresEarlier")}
					</legend>
					{earlier.length === 0 ? (
						<p className="font-sans text-sm text-fg-muted">
							{t("requiresNone")}
						</p>
					) : (
						earlier.map((item) => (
							<label key={item.id} className="flex min-h-11 items-center gap-3">
								<input
									type="checkbox"
									className="size-5 accent-ink"
									checked={requires.includes(item.id)}
									disabled={!editable}
									onChange={(event) => {
										setRequires((current) =>
											event.target.checked
												? [...current, item.id]
												: current.filter((id) => id !== item.id),
										);
									}}
								/>
								<span className="font-sans text-sm font-medium text-fg">
									{item.title}
								</span>
							</label>
						))
					)}
				</fieldset>
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
						clarity={clarity.get(task.id)}
						onDirty={onDirty}
						onSaved={onSaved}
					/>
				))}
				{editable ? <AddTask moduleId={module.id} onSaved={onSaved} /> : null}
			</div>
		</section>
	);
}

function BadgeFields({
	courseId,
	badge,
	editable,
	onDirty,
	onSaved,
}: {
	courseId: string;
	badge: CourseBadge | null;
	editable: boolean;
	onDirty: (key: string, dirty: boolean) => void;
	onSaved: () => Promise<void>;
}) {
	const { t } = useI18n();
	const save = useEngineMutation("/courses/:id/badge");
	const [titleEn, setTitleEn] = useState(badge?.titleEn ?? "");
	const [titleRw, setTitleRw] = useState(badge?.titleRw ?? "");
	const [skillEn, setSkillEn] = useState(badge?.skillEn ?? "");
	const [skillRw, setSkillRw] = useState(badge?.skillRw ?? "");
	const [level, setLevel] = useState(String(badge?.level ?? 1));
	const [allRequired, setAllRequired] = useState(
		badge?.rule.allRequiredTasksApproved ?? true,
	);
	const [minimumScore, setMinimumScore] = useState(
		badge?.rule.minimumScore === null || badge?.rule.minimumScore === undefined
			? ""
			: String(badge.rule.minimumScore),
	);
	const [minimumHours, setMinimumHours] = useState(
		badge?.rule.minimumHours === null || badge?.rule.minimumHours === undefined
			? ""
			: String(badge.rule.minimumHours),
	);
	const [requiresInPerson, setRequiresInPerson] = useState(
		badge?.requiresInPerson === true,
	);
	const [error, setError] = useState<MessageKey | null>(null);
	const savedScore =
		badge?.rule.minimumScore === null || badge?.rule.minimumScore === undefined
			? ""
			: String(badge.rule.minimumScore);
	const savedHours =
		badge?.rule.minimumHours === null || badge?.rule.minimumHours === undefined
			? ""
			: String(badge.rule.minimumHours);
	const dirty =
		titleEn !== (badge?.titleEn ?? "") ||
		titleRw !== (badge?.titleRw ?? "") ||
		skillEn !== (badge?.skillEn ?? "") ||
		skillRw !== (badge?.skillRw ?? "") ||
		level !== String(badge?.level ?? 1) ||
		allRequired !== (badge?.rule.allRequiredTasksApproved ?? true) ||
		minimumScore !== savedScore ||
		minimumHours !== savedHours ||
		requiresInPerson !== (badge?.requiresInPerson === true);
	useEffect(() => {
		onDirty(`${courseId}-badge`, dirty);
	}, [courseId, dirty, onDirty]);

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		try {
			await save.mutateAsync({
				body: {
					id: courseId,
					titleEn,
					titleRw,
					skillEn,
					skillRw,
					level: Number(level),
					allRequiredTasksApproved: allRequired,
					minimumScore: minimumScore.trim() ? Number(minimumScore) : null,
					minimumHours: minimumHours.trim() ? Number(minimumHours) : null,
					requiresInPerson,
				},
			});
			await onSaved();
		} catch (caught) {
			setError(reasonKey(caught));
		}
	}

	return (
		<section>
			<h2 className="font-sans text-2xl font-semibold text-fg">
				{t("badgeHeading")}
			</h2>
			<form className="mt-4 flex flex-col gap-4" onSubmit={onSubmit}>
				<Field
					id={`${courseId}-badge-en`}
					label={t("badgeTitleEn")}
					value={titleEn}
					disabled={!editable}
					onChange={setTitleEn}
				/>
				<Field
					id={`${courseId}-badge-rw`}
					label={t("badgeTitleRw")}
					value={titleRw}
					disabled={!editable}
					onChange={setTitleRw}
					hint={titleEn.trim().length > 0 && titleRw.trim().length === 0}
				/>
				<Field
					id={`${courseId}-badge-skill-en`}
					label={t("badgeSkillEn")}
					value={skillEn}
					disabled={!editable}
					onChange={setSkillEn}
				/>
				<Field
					id={`${courseId}-badge-skill-rw`}
					label={t("badgeSkillRw")}
					value={skillRw}
					disabled={!editable}
					onChange={setSkillRw}
					hint={skillEn.trim().length > 0 && skillRw.trim().length === 0}
				/>
				<Field
					id={`${courseId}-badge-level`}
					label={t("badgeLevel")}
					value={level}
					disabled={!editable}
					onChange={setLevel}
				/>
				<label
					className="flex items-center gap-3"
					htmlFor={`${courseId}-badge-all`}
				>
					<input
						id={`${courseId}-badge-all`}
						type="checkbox"
						className="size-4 accent-ink"
						checked={allRequired}
						disabled={!editable}
						onChange={(event) => setAllRequired(event.target.checked)}
					/>
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("badgeAllTasks")}
					</span>
				</label>
				<label
					className="flex items-center gap-3"
					htmlFor={`${courseId}-badge-visit`}
				>
					<input
						id={`${courseId}-badge-visit`}
						type="checkbox"
						className="size-4 accent-ink"
						checked={requiresInPerson}
						disabled={!editable}
						onChange={(event) => setRequiresInPerson(event.target.checked)}
					/>
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("badgeInPerson")}
					</span>
				</label>
				<Field
					id={`${courseId}-badge-score`}
					label={t("minimumScore")}
					value={minimumScore}
					disabled={!editable}
					onChange={setMinimumScore}
				/>
				<Field
					id={`${courseId}-badge-hours`}
					label={t("minimumHours")}
					value={minimumHours}
					disabled={!editable}
					onChange={setMinimumHours}
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
		</section>
	);
}

function TaskFields({
	task,
	editable,
	clarity,
	onDirty,
	onSaved,
}: {
	task: Task;
	editable: boolean;
	clarity: { clear: number; hard: number } | undefined;
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
	const [passThreshold, setPassThreshold] = useState(
		String(task.passThreshold),
	);
	const [required, setRequired] = useState(task.required);
	const [imageKey, setImageKey] = useState(task.imageKey);
	const [audioKey, setAudioKey] = useState(task.audioKey);
	const [jobAidKey, setJobAidKey] = useState(task.jobAidKey);
	const [outboundUrl, setOutboundUrl] = useState(task.outboundUrl);
	const [error, setError] = useState<MessageKey | null>(null);
	const dirty =
		titleEn !== task.titleEn ||
		titleRw !== task.titleRw ||
		instructionsEn !== task.instructionsEn ||
		instructionsRw !== task.instructionsRw ||
		evidenceType !== (task.evidenceType ?? "") ||
		passThreshold !== String(task.passThreshold) ||
		required !== task.required ||
		imageKey !== task.imageKey ||
		audioKey !== task.audioKey ||
		jobAidKey !== task.jobAidKey ||
		outboundUrl !== task.outboundUrl;
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
					passThreshold: Number(passThreshold),
					required,
					imageKey,
					audioKey,
					jobAidKey,
					outboundUrl,
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
			{clarity && clarity.hard > 0 ? (
				<p className="mt-2 font-sans text-lg text-fg">
					{t("learnersSaidHard", { count: String(clarity.hard) })}
				</p>
			) : null}
			{clarity && clarity.clear > 0 ? (
				<p className="mt-2 font-sans text-lg text-fg">
					{t("learnersSaidClear", { count: String(clarity.clear) })}
				</p>
			) : null}
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
				<Field
					id={`${task.id}-pass`}
					label={t("passThreshold")}
					value={passThreshold}
					disabled={!editable}
					onChange={setPassThreshold}
				/>
				<label
					className="flex items-center gap-3"
					htmlFor={`${task.id}-required`}
				>
					<input
						id={`${task.id}-required`}
						type="checkbox"
						className="size-4 accent-ink"
						checked={required}
						disabled={!editable}
						onChange={(event) => setRequired(event.target.checked)}
					/>
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("taskRequired")}
					</span>
				</label>
				<p className="font-sans text-sm text-fg-muted">{t("mediaKeyHint")}</p>
				<Field
					id={`${task.id}-image`}
					label={t("imageKey")}
					value={imageKey}
					disabled={!editable}
					onChange={setImageKey}
				/>
				<Field
					id={`${task.id}-audio`}
					label={t("audioKey")}
					value={audioKey}
					disabled={!editable}
					onChange={setAudioKey}
				/>
				<Field
					id={`${task.id}-job-aid`}
					label={t("jobAidKey")}
					value={jobAidKey}
					disabled={!editable}
					onChange={setJobAidKey}
				/>
				<Field
					id={`${task.id}-link`}
					label={t("outboundUrl")}
					value={outboundUrl}
					disabled={!editable}
					onChange={setOutboundUrl}
				/>
				<p className="font-sans text-sm text-fg-muted">{t("outboundHint")}</p>
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
	const [passThreshold, setPassThreshold] = useState(
		String(criterion.passThreshold),
	);
	const [promptEn, setPromptEn] = useState(criterion.promptEn);
	const [promptRw, setPromptRw] = useState(criterion.promptRw);
	const [error, setError] = useState<MessageKey | null>(null);
	const dirty =
		weight !== String(criterion.weight) ||
		passThreshold !== String(criterion.passThreshold) ||
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
					passThreshold: Number(passThreshold),
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
				id={`${criterion.id}-pass`}
				label={t("passThreshold")}
				value={passThreshold}
				disabled={!editable}
				onChange={setPassThreshold}
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
	const [passThreshold, setPassThreshold] = useState("100");
	const [promptEn, setPromptEn] = useState("");
	const [promptRw, setPromptRw] = useState("");
	const [error, setError] = useState<MessageKey | null>(null);

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		try {
			await create.mutateAsync({
				body: {
					id: taskId,
					weight: Number(weight),
					passThreshold: Number(passThreshold),
					promptEn,
					promptRw,
				},
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
				id={`${taskId}-new-pass`}
				label={t("passThreshold")}
				value={passThreshold}
				onChange={setPassThreshold}
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
