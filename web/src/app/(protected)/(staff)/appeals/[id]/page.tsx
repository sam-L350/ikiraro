import { type FormEvent, useState } from "react";
import { Link, useParams } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isApiClientError, useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { useOnline } from "@/lib/offline/use-online";

type AppealStatus = "open" | "upheld" | "overturned";
type AppealOutcome = "upheld" | "overturned";

type AppealDetail = {
	id: string;
	learnerName: string;
	centerName: string;
	taskTitleRw: string;
	taskTitleEn: string;
	status: AppealStatus;
	note: string;
	decisionNote: string | null;
	rejectionNote: string;
	instructionsRw: string;
	instructionsEn: string;
};

function textFor(locale: "rw" | "en", rw: string, en: string): string {
	if (locale === "rw" && rw.trim()) return rw;
	if (en.trim()) return en;
	return rw;
}

function outcomeBadge(status: AppealStatus): {
	key: MessageKey;
	variant: "pending" | "neutral" | "danger";
} {
	switch (status) {
		case "open":
			return { key: "appealOpenStatus", variant: "pending" };
		case "upheld":
			return { key: "appealUphold", variant: "danger" };
		case "overturned":
			return { key: "appealOverturn", variant: "neutral" };
		default: {
			const unreachable: never = status;
			return unreachable;
		}
	}
}

function closeError(caught: unknown): MessageKey {
	if (!isApiClientError(caught)) return "tryAgain";
	switch (caught.status) {
		case 409:
			return "appealClosed";
		case 404:
			return "appealMissing";
		default:
			return "tryAgain";
	}
}

export default function AppealPage() {
	const { locale, t } = useI18n();
	const online = useOnline();
	const { id = "" } = useParams();
	const appeal = useEngine(
		"/appeals/:id",
		{ query: { id } },
		{ enabled: Boolean(id) },
	);
	const close = useEngineMutation("/appeals/:id/close");
	const [outcome, setOutcome] = useState<AppealOutcome>("upheld");
	const [note, setNote] = useState("");
	const [error, setError] = useState<MessageKey | null>(null);

	async function onSave(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		try {
			await close.mutateAsync({ body: { id, outcome, note } });
			setNote("");
			await appeal.invalidate();
		} catch (caught) {
			setError(closeError(caught));
		}
	}

	if (appeal.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(appeal.error) && appeal.error.status === 404) {
		return (
			<p className="font-sans text-lg font-medium text-fg">
				{t("appealMissing")}
			</p>
		);
	}
	if (isApiClientError(appeal.error) && appeal.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("homeUnavailable")}
			</p>
		);
	}
	if (appeal.error || !appeal.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const row = appeal.data as AppealDetail;
	const badge = outcomeBadge(row.status);
	const title = textFor(locale, row.taskTitleRw, row.taskTitleEn);
	const instructions = textFor(locale, row.instructionsRw, row.instructionsEn);
	const learner = row.learnerName.trim() || t("learnerUnnamed");

	return (
		<div className="mx-auto flex max-w-3xl flex-col gap-8">
			<Link to="/appeals" className="font-sans text-sm font-semibold text-fg">
				{t("appealsTitle")}
			</Link>
			<div className="flex flex-col gap-3">
				<div className="flex flex-wrap items-center gap-3">
					<h1 className="font-sans text-4xl font-semibold leading-tight text-fg">
						{title || t("appealTitle")}
					</h1>
					<Badge variant={badge.variant}>{t(badge.key)}</Badge>
				</div>
				<p className="font-sans text-lg text-fg">
					{learner} · {row.centerName}
				</p>
				<p className="max-w-xl font-sans text-lg font-medium text-fg">
					{t("appealSentence")}
				</p>
				{online ? null : (
					<p className="font-sans text-lg text-fg">{t("appealOffline")}</p>
				)}
			</div>
			{instructions ? (
				<p className="font-sans text-lg text-fg">{instructions}</p>
			) : null}
			<div className="flex flex-col gap-2">
				<p className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
					{t("rejectionNote")}
				</p>
				<p className="font-sans text-lg text-fg">{row.rejectionNote}</p>
			</div>
			<div className="flex flex-col gap-2">
				<p className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
					{t("appealLearnerNote")}
				</p>
				<p className="font-sans text-lg text-fg">{row.note}</p>
			</div>
			{row.status === "open" ? (
				<form
					className="flex flex-col gap-4"
					onSubmit={(event) => void onSave(event)}
				>
					<fieldset className="flex flex-col gap-3">
						<legend className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("appealOutcome")}
						</legend>
						<label className="flex items-center gap-3 font-sans text-lg text-fg">
							<input
								type="radio"
								name="outcome"
								value="upheld"
								checked={outcome === "upheld"}
								onChange={() => setOutcome("upheld")}
							/>
							{t("appealUphold")}
						</label>
						<label className="flex items-center gap-3 font-sans text-lg text-fg">
							<input
								type="radio"
								name="outcome"
								value="overturned"
								checked={outcome === "overturned"}
								onChange={() => setOutcome("overturned")}
							/>
							{t("appealOverturn")}
						</label>
					</fieldset>
					<label className="flex flex-col gap-2" htmlFor="appeal-note">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("appealNote")}
						</span>
						<textarea
							id="appeal-note"
							className="min-h-32 rounded-md border border-line bg-card px-3 py-3 font-sans text-lg text-fg"
							value={note}
							disabled={!online || close.isPending}
							onChange={(event) => setNote(event.target.value)}
						/>
					</label>
					{error ? (
						<p
							className="font-sans text-sm font-medium text-danger"
							role="alert"
						>
							{t(error)}
						</p>
					) : null}
					<Button
						type="submit"
						variant="sticker"
						className="w-fit"
						disabled={!online || close.isPending || note.trim().length === 0}
					>
						{t("appealSave")}
					</Button>
				</form>
			) : row.decisionNote ? (
				<p className="font-sans text-lg text-fg">{row.decisionNote}</p>
			) : null}
		</div>
	);
}
