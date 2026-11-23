import { Camera, File, FileText, Image, PenLine, Volume2 } from "lucide-react";
import {
	type ChangeEvent,
	type ReactNode,
	useEffect,
	useRef,
	useState,
} from "react";
import { Link, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import {
	invalidateEngine,
	isApiClientError,
	useEngine,
	useEngineMutation,
} from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import { prepareEvidenceFile } from "@/lib/media/prepare";
import {
	mediaShouldLoad,
	readDataSaver,
	writeDataSaver,
} from "@/lib/offline/data-saver";

type EvidenceKind = "photo" | "file" | "note";
type ClarityRating = "clear" | "hard";
type MediaKind = "picture" | "narration" | "jobAid";

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
			imageKey: string | null;
			audioKey: string | null;
			jobAidKey: string | null;
			outboundUrl: string | null;
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
	const [reading, setReading] = useState(false);
	const [speakError, setSpeakError] = useState(false);
	const [dataSaver, setDataSaver] = useState(readDataSaver);
	const [asked, setAsked] = useState<Record<MediaKind, boolean>>({
		picture: false,
		narration: false,
		jobAid: false,
	});
	const [chosen, setChosen] = useState<ClarityRating | null | undefined>(
		undefined,
	);
	const [sending, setSending] = useState(false);
	const [stored, setStored] = useState<
		"photo" | "file" | "too_large" | "failed" | null
	>(null);
	const enrollment = useEngine(
		"/enrollments/:id",
		{ query: { id: enrollmentId } },
		{ enabled: enrollmentId.length > 0 },
	);
	const clarity = useEngine(
		"/enrollments/:id/clarity",
		{ query: { id: enrollmentId } },
		{ enabled: enrollmentId.length > 0 },
	);
	const start = useEngineMutation("/enrollments/:id/start");
	const saveClarity = useEngineMutation("/enrollments/:id/clarity/update");
	const intent = useEngineMutation("/media/upload-intent");
	const finalize = useEngineMutation("/media/:id/finalize");

	useEffect(() => {
		document.documentElement.lang = locale === "rw" ? "rw" : "en";
		setReading(false);
		return () => {
			window.speechSynthesis?.cancel();
		};
	}, [locale]);

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
	const saved = clarity.data?.ratings.find((item) => item.taskId === taskId);
	const rating = chosen === undefined ? (saved?.rating ?? null) : chosen;
	const practice = practiceHref(task.outboundUrl);

	function readAloud() {
		if (!("speechSynthesis" in window)) {
			setSpeakError(true);
			return;
		}
		if (reading) {
			window.speechSynthesis.cancel();
			setReading(false);
			return;
		}
		const utterance = new SpeechSynthesisUtterance(instructions.join("\n"));
		utterance.lang = locale === "rw" ? "rw" : "en";
		utterance.onend = () => setReading(false);
		window.speechSynthesis.cancel();
		window.speechSynthesis.speak(utterance);
		setReading(true);
		setSpeakError(false);
	}

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

	async function onFile(event: ChangeEvent<HTMLInputElement>) {
		const chosenFile = event.target.files?.[0];
		event.target.value = "";
		if (!chosenFile) return;
		setSending(true);
		setStored(null);
		try {
			const prepared = await prepareEvidenceFile(chosenFile);
			if (prepared === "too_large") {
				setStored("too_large");
				return;
			}
			if (prepared === "type") {
				setStored("failed");
				return;
			}
			const started = await intent.mutateAsync({
				body: {
					contentType: prepared.contentType,
					byteSize: prepared.bytes.size,
				},
			});
			const put = await fetch(started.uploadUrl, {
				method: "PUT",
				headers: { "content-type": started.contentType },
				body: prepared.bytes,
				credentials: "omit",
			});
			if (!put.ok) {
				setStored("failed");
				return;
			}
			await finalize.mutateAsync({
				body: { id: started.id, sha256: prepared.sha256 },
			});
			setStored(kind === "photo" ? "photo" : "file");
		} catch (caught) {
			const details = isApiClientError(caught) ? caught.details : undefined;
			const reason =
				details && typeof details === "object" && "reason" in details
					? details.reason
					: undefined;
			setStored(
				reason === "too_large" || reason === "size" ? "too_large" : "failed",
			);
		} finally {
			setSending(false);
		}
	}

	async function rate(next: ClarityRating) {
		setChosen(next);
		try {
			await saveClarity.mutateAsync({
				body: { id: enrollmentId, taskId, rating: next },
			});
			await invalidateEngine("/enrollments/:id/clarity");
		} catch (caught) {
			setChosen(undefined);
			if (isApiClientError(caught)) return;
			throw caught;
		}
	}

	function ask(kindToLoad: MediaKind) {
		setAsked((current) => ({ ...current, [kindToLoad]: true }));
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
			{instructions.length > 0 ? (
				<div className="flex flex-col gap-2">
					<Button
						type="button"
						variant="quiet"
						className="w-fit"
						aria-pressed={reading}
						onClick={readAloud}
					>
						<Volume2 aria-hidden="true" />
						{reading ? t("stopReading") : t("readAloud")}
					</Button>
					{speakError ? (
						<p className="text-lg text-fg">{t("cannotReadAloud")}</p>
					) : null}
				</div>
			) : null}
			<div className="flex flex-col gap-2">
				<label
					className="flex min-h-11 items-center gap-3"
					htmlFor="data-saver"
				>
					<input
						id="data-saver"
						type="checkbox"
						className="size-5 accent-ink"
						checked={dataSaver}
						onChange={(event) => {
							setDataSaver(event.target.checked);
							writeDataSaver(event.target.checked);
						}}
					/>
					<span className="text-lg text-fg">{t("dataSaver")}</span>
				</label>
				<p className="text-lg text-fg">{t("dataSaverHint")}</p>
				<MediaRow
					label={t("loadPicture")}
					present={task.imageKey !== null}
					show={mediaShouldLoad(dataSaver, asked.picture)}
					held={t("mediaHeld")}
					onAsk={() => ask("picture")}
					icon={<Image aria-hidden="true" />}
				/>
				<MediaRow
					label={t("loadNarration")}
					present={task.audioKey !== null}
					show={mediaShouldLoad(dataSaver, asked.narration)}
					held={t("mediaHeld")}
					onAsk={() => ask("narration")}
					icon={<Volume2 aria-hidden="true" />}
				/>
				<MediaRow
					label={t("loadJobAid")}
					present={task.jobAidKey !== null}
					show={mediaShouldLoad(dataSaver, asked.jobAid)}
					held={t("mediaHeld")}
					onAsk={() => ask("jobAid")}
					icon={<FileText aria-hidden="true" />}
				/>
				{practice ? (
					<a
						href={practice}
						target="_blank"
						rel="noreferrer"
						className="inline-flex min-h-11 items-center text-lg text-fg"
					>
						{t("practiceLink")}
					</a>
				) : null}
			</div>
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
			<div className="flex flex-wrap gap-3">
				<Button
					type="button"
					variant="quiet"
					aria-pressed={rating === "clear"}
					disabled={saveClarity.isPending}
					onClick={() => void rate("clear")}
				>
					{t("clearEnough")}
				</Button>
				<Button
					type="button"
					variant="quiet"
					aria-pressed={rating === "hard"}
					disabled={saveClarity.isPending}
					onClick={() => void rate("hard")}
				>
					{t("tooHard")}
				</Button>
			</div>
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
							onChange={(event) => void onFile(event)}
						/>
					) : null}
					<Button
						type="button"
						className="w-fit"
						disabled={start.isPending || sending}
						onClick={() => void openEvidence()}
					>
						<EvidenceIcon kind={kind} />
						{evidenceLabel(kind, t)}
					</Button>
					{stored ? (
						<p className="text-lg text-fg">{storedCopy(stored, t)}</p>
					) : null}
				</div>
			)}
		</div>
	);
}

function MediaRow({
	label,
	present,
	show,
	held,
	onAsk,
	icon,
}: {
	label: string;
	present: boolean;
	show: boolean;
	held: string;
	onAsk: () => void;
	icon: ReactNode;
}) {
	if (!present) return null;
	if (!show) {
		return (
			<Button type="button" variant="quiet" className="w-fit" onClick={onAsk}>
				{icon}
				{label}
			</Button>
		);
	}
	return <p className="text-lg text-fg">{held}</p>;
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

function storedCopy(
	state: "photo" | "file" | "too_large" | "failed",
	t: (
		key:
			| "evidenceStoredPhoto"
			| "evidenceStoredFile"
			| "evidenceTooLarge"
			| "evidenceUploadFailed",
	) => string,
): string {
	switch (state) {
		case "photo":
			return t("evidenceStoredPhoto");
		case "file":
			return t("evidenceStoredFile");
		case "too_large":
			return t("evidenceTooLarge");
		case "failed":
			return t("evidenceUploadFailed");
		default: {
			const unreachable: never = state;
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

function practiceHref(value: string | null): string | null {
	if (!value) return null;
	if (value.startsWith("https://") || value.startsWith("http://")) return value;
	return null;
}
