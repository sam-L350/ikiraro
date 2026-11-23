import { Camera, File, FileText, Image, PenLine, Volume2 } from "lucide-react";
import {
	type ChangeEvent,
	type ReactNode,
	useEffect,
	useRef,
	useState,
} from "react";
import { Link, useParams } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	invalidateEngine,
	isApiClientError,
	useEngine,
	useEngineMutation,
} from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import { deviceType, readGeo } from "@/lib/media/device";
import { prepareEvidenceFile } from "@/lib/media/prepare";
import { type PhotoWarning, readPhotoWarning } from "@/lib/media/quality";
import { blobToBase64 } from "@/lib/offline/bytes";
import {
	mediaShouldLoad,
	readDataSaver,
	writeDataSaver,
} from "@/lib/offline/data-saver";
import { deliverSubmission } from "@/lib/offline/deliver";
import {
	classifyFailure,
	enqueueSubmission,
	flushQueue,
	isQueued,
	type SubmissionQueuePayload,
} from "@/lib/offline/outbox";

type EvidenceKind = "photo" | "file" | "note";
type StoredNotice =
	| "photo"
	| "file"
	| "note"
	| "empty"
	| "closed"
	| "limit"
	| "too_large"
	| "failed";
type HeldPhoto = {
	bytes: Blob;
	contentType: string;
	sha256: string;
	warning: Exclude<PhotoWarning, "ok">;
};
type SubmissionStatus =
	| "draft"
	| "pending"
	| "in_review"
	| "approved"
	| "needs_revision"
	| "rejected"
	| "escalated"
	| "withdrawn";
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
	const [stored, setStored] = useState<StoredNotice | null>(null);
	const [held, setHeld] = useState<HeldPhoto | null>(null);
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
	const history = useEngine(
		"/enrollments/:id/submissions",
		{ query: { id: enrollmentId } },
		{ enabled: enrollmentId.length > 0 },
	);
	const withdraw = useEngineMutation("/submissions/:id/withdraw");

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
		if (kind === "note" && opened) {
			await sendNote();
			return;
		}
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

	async function sendNote() {
		const text = note.current?.value.trim() ?? "";
		if (!text) {
			setStored("empty");
			note.current?.focus();
			return;
		}
		setSending(true);
		setStored(null);
		try {
			const result = await sendOrQueue({ evidenceType: "note", note: text });
			if (result === "sent") {
				setStored("note");
				if (note.current) note.current.value = "";
			}
		} catch (caught) {
			setStored(noticeFor(caught));
		} finally {
			setSending(false);
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
			if (kind === "photo") {
				const warning = await readPhotoWarning(prepared.bytes);
				if (warning !== "ok") {
					setHeld({
						bytes: prepared.bytes,
						contentType: prepared.contentType,
						sha256: prepared.sha256,
						warning,
					});
					return;
				}
			}
			setHeld(null);
			const result = await sendOrQueue({
				evidenceType: kind === "photo" ? "photo" : "file",
				bytes: prepared.bytes,
				contentType: prepared.contentType,
				sha256: prepared.sha256,
			});
			if (result === "sent") setStored(kind === "photo" ? "photo" : "file");
		} catch (caught) {
			setStored(noticeFor(caught));
		} finally {
			setSending(false);
		}
	}

	async function sendHeld() {
		if (!held) return;
		setSending(true);
		setStored(null);
		try {
			const result = await sendOrQueue({
				evidenceType: "photo",
				bytes: held.bytes,
				contentType: held.contentType,
				sha256: held.sha256,
			});
			setHeld(null);
			if (result === "sent") setStored("photo");
		} catch (caught) {
			setStored(noticeFor(caught));
		} finally {
			setSending(false);
		}
	}

	async function sendOrQueue(input: {
		evidenceType: EvidenceKind;
		bytes?: Blob;
		contentType?: string;
		sha256?: string;
		note?: string;
	}): Promise<"sent" | "queued"> {
		const online = navigator.onLine;
		const geo = online ? await readGeo() : null;
		const payload: SubmissionQueuePayload = {
			kind: "submission",
			id: crypto.randomUUID(),
			enrollmentId,
			taskId,
			evidenceType: input.evidenceType,
			contentType: input.contentType ?? "text/plain",
			sha256: input.sha256 ?? "",
			bytesBase64: input.bytes ? await blobToBase64(input.bytes) : "",
			note: input.note ?? null,
			deviceInfo: deviceType(),
			geoLat: geo?.geoLat ?? null,
			geoLng: geo?.geoLng ?? null,
			submit: true,
		};
		if (!online) {
			enqueueSubmission(payload);
			return "queued";
		}
		try {
			await deliverSubmission(payload);
			return "sent";
		} catch (caught) {
			if (classifyFailure(caught) !== "retry") throw caught;
			enqueueSubmission(payload);
			await flushQueue(deliverSubmission);
			return isQueued(payload.id) ? "queued" : "sent";
		}
	}

	async function takeBack(id: string) {
		setSending(true);
		try {
			await withdraw.mutateAsync({ body: { id } });
			await invalidateEngine("/enrollments/:id/submissions");
			setStored(null);
		} catch (caught) {
			setStored(noticeFor(caught));
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

	const attempts = (history.data?.submissions ?? []).filter(
		(item) => item.taskId === taskId,
	);
	const openAttempt = attempts.some(
		(item) =>
			item.status === "draft" ||
			item.status === "pending" ||
			item.status === "in_review",
	);
	const standingDecision = attempts.some(
		(item) =>
			(item.status === "approved" && !item.revoked) ||
			item.status === "rejected" ||
			item.status === "escalated",
	);
	const revisions = attempts.filter(
		(item) => item.status === "needs_revision",
	).length;
	const limited = revisions >= 4 && !openAttempt && !standingDecision;
	const blocked = openAttempt || standingDecision || limited;
	const canResend = revisions > 0 && !blocked;
	const waiting = attempts.find(
		(item) => item.status === "draft" || item.status === "pending",
	);

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
							accept={kind === "photo" ? "image/*" : "application/pdf"}
							capture={kind === "photo" ? "environment" : undefined}
							className="sr-only"
							aria-hidden="true"
							tabIndex={-1}
							onChange={(event) => void onFile(event)}
						/>
					) : null}
					{limited ? (
						<p className="text-lg text-fg">{t("meetTrainer")}</p>
					) : (
						<Button
							type="button"
							className="w-fit"
							disabled={start.isPending || sending || blocked}
							onClick={() => void openEvidence()}
						>
							<EvidenceIcon kind={kind} />
							{evidenceLabel(kind, t)}
						</Button>
					)}
					{canResend ? (
						<p className="text-lg text-fg">{t("sendAgain")}</p>
					) : null}
					{held ? (
						<p className="text-lg text-fg">{warningCopy(held.warning, t)}</p>
					) : null}
					{held ? (
						<Button
							type="button"
							variant="quiet"
							className="w-fit"
							disabled={sending}
							onClick={() => void sendHeld()}
						>
							{t("sendThisPhoto")}
						</Button>
					) : null}
					{stored ? (
						<p className="text-lg text-fg">{storedCopy(stored, t)}</p>
					) : null}
					{attempts.length > 0 ? (
						<section className="flex flex-col gap-2 border-t border-line pt-4">
							<h2 className="font-meta text-xs uppercase text-fg-muted">
								{t("submissionHistory")}
							</h2>
							<ul className="flex flex-col">
								{attempts.map((item) => (
									<li
										key={item.id}
										className="flex flex-col gap-2 border-b border-line py-3"
									>
										<div className="flex min-h-11 items-center justify-between gap-3">
											<span className="text-lg text-fg">
												{t("attemptLabel", { count: String(item.attempt) })}
											</span>
											<Badge variant={pillFor(item.status)}>
												{statusLabel(item.status, t)}
											</Badge>
										</div>
										{item.feedback ? (
											<p className="text-lg text-fg">{item.feedback}</p>
										) : null}
									</li>
								))}
							</ul>
							{waiting ? (
								<Button
									type="button"
									variant="quiet"
									className="w-fit"
									disabled={sending}
									onClick={() => void takeBack(waiting.id)}
								>
									{t("withdrawSubmission")}
								</Button>
							) : null}
						</section>
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

function warningCopy(
	warning: Exclude<PhotoWarning, "ok">,
	t: (key: "photoDark" | "photoBlurry" | "photoDarkBlurry") => string,
): string {
	switch (warning) {
		case "dark":
			return t("photoDark");
		case "blurry":
			return t("photoBlurry");
		case "both":
			return t("photoDarkBlurry");
		default: {
			const unreachable: never = warning;
			return unreachable;
		}
	}
}

function noticeFor(caught: unknown): StoredNotice {
	const details = isApiClientError(caught) ? caught.details : undefined;
	const reason =
		details && typeof details === "object" && "reason" in details
			? details.reason
			: undefined;
	if (reason === "too_large" || reason === "size") return "too_large";
	if (reason === "limit") return "limit";
	if (reason === "closed" || reason === "open" || reason === "review_started") {
		return "closed";
	}
	return "failed";
}

function storedCopy(
	state: StoredNotice,
	t: (
		key:
			| "evidenceStoredPhoto"
			| "evidenceStoredFile"
			| "evidenceStoredNote"
			| "evidenceNoteEmpty"
			| "evidenceClosed"
			| "meetTrainer"
			| "evidenceTooLarge"
			| "evidenceUploadFailed",
	) => string,
): string {
	switch (state) {
		case "photo":
			return t("evidenceStoredPhoto");
		case "file":
			return t("evidenceStoredFile");
		case "note":
			return t("evidenceStoredNote");
		case "empty":
			return t("evidenceNoteEmpty");
		case "closed":
			return t("evidenceClosed");
		case "limit":
			return t("meetTrainer");
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

function pillFor(status: SubmissionStatus) {
	switch (status) {
		case "draft":
		case "withdrawn":
			return "neutral" as const;
		case "pending":
		case "needs_revision":
			return "pending" as const;
		case "in_review":
		case "escalated":
			return "info" as const;
		case "approved":
			return "verified" as const;
		case "rejected":
			return "rejected" as const;
		default: {
			const unreachable: never = status;
			return unreachable;
		}
	}
}

function statusLabel(
	status: SubmissionStatus,
	t: (
		key:
			| "submissionDraft"
			| "submissionPending"
			| "submissionInReview"
			| "submissionApproved"
			| "submissionNeedsRevision"
			| "submissionRejected"
			| "submissionEscalated"
			| "submissionWithdrawn",
	) => string,
): string {
	switch (status) {
		case "draft":
			return t("submissionDraft");
		case "pending":
			return t("submissionPending");
		case "in_review":
			return t("submissionInReview");
		case "approved":
			return t("submissionApproved");
		case "needs_revision":
			return t("submissionNeedsRevision");
		case "rejected":
			return t("submissionRejected");
		case "escalated":
			return t("submissionEscalated");
		case "withdrawn":
			return t("submissionWithdrawn");
		default: {
			const unreachable: never = status;
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
