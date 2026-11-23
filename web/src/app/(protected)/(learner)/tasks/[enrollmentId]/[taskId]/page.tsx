import { Camera, File, PenLine } from "lucide-react";
import { useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import {
	invalidateEngine,
	isApiClientError,
	useEngine,
	useEngineMutation,
} from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

type EvidenceKind = "photo" | "file" | "note";

type TaskView = {
	enrollmentId: string;
	courseTitleEn: string;
	courseTitleRw: string;
	modules: {
		id: string;
		status: "locked" | "not_started" | "started" | "complete";
		tasks: {
			id: string;
			titleEn: string;
			titleRw: string;
			instructionsEn: string;
			instructionsRw: string;
			evidenceType: string | null;
			criteria: { id: string; promptEn: string; promptRw: string }[];
		}[];
	}[];
};

export default function TaskPage() {
	const { enrollmentId = "", taskId = "" } = useParams();
	const { locale, t } = useI18n();
	const note = useRef<HTMLTextAreaElement>(null);
	const file = useRef<HTMLInputElement>(null);
	const [opened, setOpened] = useState(false);
	const enrollment = useEngine(
		"/enrollments/:id",
		{ query: { id: enrollmentId } },
		{ enabled: enrollmentId.length > 0 },
	);
	const start = useEngineMutation("/enrollments/:id/start");

	if (enrollment.isPending) {
		return (
			<div className="mx-auto max-w-3xl px-4 py-8">
				<div className="h-16 animate-pulse rounded-md bg-surface" />
			</div>
		);
	}
	if (enrollment.error || !enrollment.data) {
		return (
			<div className="mx-auto max-w-3xl px-4 py-8">
				<p className="text-lg text-destructive">{t("tryAgain")}</p>
			</div>
		);
	}

	const view = enrollment.data as TaskView;
	const module = view.modules.find((item) =>
		item.tasks.some((task) => task.id === taskId),
	);
	const task = module?.tasks.find((item) => item.id === taskId);
	if (!module || !task) {
		return (
			<div className="mx-auto max-w-3xl px-4 py-8">
				<p className="text-lg text-destructive">{t("tryAgain")}</p>
			</div>
		);
	}

	const kind = evidenceKind(task.evidenceType);
	const instructions = paragraphs(
		textFor(locale, task.instructionsRw, task.instructionsEn),
	);
	const criteria = task.criteria
		.map((item) => textFor(locale, item.promptRw, item.promptEn))
		.filter((prompt) => prompt.length > 0);
	const locked = module.status === "locked";

	async function openEvidence() {
		try {
			await start.mutateAsync({
				body: { id: enrollmentId, taskId },
			});
			await invalidateEngine("/enrollments");
			await invalidateEngine("/enrollments/:id");
			setOpened(true);
			if (kind === "note") note.current?.focus();
			else file.current?.click();
		} catch (caught) {
			if (isApiClientError(caught)) return;
			throw caught;
		}
	}

	return (
		<div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
			<p className="text-lg text-fg-muted">
				{textFor(locale, view.courseTitleRw, view.courseTitleEn)}
			</p>
			<h1 className="font-sans text-2xl font-semibold text-fg">
				{textFor(locale, task.titleRw, task.titleEn)}
			</h1>
			{instructions.map((paragraph) => (
				<p key={paragraph} className="text-lg leading-relaxed text-fg">
					{paragraph}
				</p>
			))}
			{criteria.length > 0 ? (
				<section className="flex flex-col gap-2 border-t border-line pt-4">
					<h2 className="font-meta text-xs uppercase text-fg-muted">
						{t("rubricChecks")}
					</h2>
					<ul className="flex flex-col">
						{criteria.map((prompt) => (
							<li
								key={prompt}
								className="border-b border-line py-3 text-lg text-fg"
							>
								{prompt}
							</li>
						))}
					</ul>
				</section>
			) : null}
			{locked ? (
				<>
					<p className="text-lg text-fg">{t("finishEarlier")}</p>
					<Link to="/home" className="min-h-11 text-lg text-fg">
						{t("navHome")}
					</Link>
				</>
			) : (
				<div className="flex flex-col gap-3">
					<p className="text-lg text-fg">{evidenceCopy(kind, t)}</p>
					{kind === "note" && opened ? (
						<textarea
							ref={note}
							className="min-h-32 rounded-md border border-line bg-card px-3 py-3 text-lg text-fg"
							aria-label={t("writeNote")}
						/>
					) : null}
					{kind !== "note" ? (
						<input
							ref={file}
							type="file"
							accept={kind === "photo" ? "image/*" : undefined}
							className="sr-only"
							aria-hidden="true"
							tabIndex={-1}
						/>
					) : null}
					<Button
						type="button"
						className="w-fit"
						disabled={start.isPending}
						onClick={() => void openEvidence()}
					>
						<EvidenceIcon kind={kind} />
						{evidenceLabel(kind, t)}
					</Button>
				</div>
			)}
		</div>
	);
}

function EvidenceIcon({ kind }: { kind: EvidenceKind }) {
	switch (kind) {
		case "photo":
			return <Camera aria-hidden="true" />;
		case "file":
			return <File aria-hidden="true" />;
		case "note":
			return <PenLine aria-hidden="true" />;
		default: {
			const unreachable: never = kind;
			return unreachable;
		}
	}
}

function evidenceLabel(
	kind: EvidenceKind,
	t: (key: "takePhoto" | "addFile" | "writeNote") => string,
): string {
	switch (kind) {
		case "photo":
			return t("takePhoto");
		case "file":
			return t("addFile");
		case "note":
			return t("writeNote");
		default: {
			const unreachable: never = kind;
			return unreachable;
		}
	}
}

function evidenceCopy(
	kind: EvidenceKind,
	t: (
		key: "evidenceAsksPhoto" | "evidenceAsksFile" | "evidenceAsksNote",
	) => string,
): string {
	switch (kind) {
		case "photo":
			return t("evidenceAsksPhoto");
		case "file":
			return t("evidenceAsksFile");
		case "note":
			return t("evidenceAsksNote");
		default: {
			const unreachable: never = kind;
			return unreachable;
		}
	}
}

function evidenceKind(value: string | null): EvidenceKind {
	switch (value) {
		case "photo":
		case "file":
		case "note":
			return value;
		default:
			return "note";
	}
}

function textFor(locale: "rw" | "en", rw: string, en: string): string {
	if (locale === "rw" && rw.trim()) return rw;
	if (en.trim()) return en;
	return rw;
}

function paragraphs(value: string): string[] {
	return value
		.split(/\n+/)
		.map((part) => part.trim())
		.filter((part) => part.length > 0);
}
