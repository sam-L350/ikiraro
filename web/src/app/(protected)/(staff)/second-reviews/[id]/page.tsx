import { type FormEvent, useState } from "react";
import { Link, useParams } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isApiClientError, useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { useOnline } from "@/lib/offline/use-online";

type SecondStatus = "open" | "agreed" | "disagreed";
type SecondOutcome = "agreed" | "disagreed";

type SecondReviewDetail = {
	id: string;
	learnerName: string;
	centerName: string;
	taskTitleRw: string;
	taskTitleEn: string;
	status: SecondStatus;
	note: string | null;
	instructionsRw: string;
	instructionsEn: string;
	learnerNote: string | null;
};

function textFor(locale: "rw" | "en", rw: string, en: string): string {
	if (locale === "rw" && rw.trim()) return rw;
	if (en.trim()) return en;
	return rw;
}

function outcomeBadge(status: SecondStatus): {
	key: MessageKey;
	variant: "pending" | "neutral" | "danger";
} {
	switch (status) {
		case "open":
			return { key: "secondReviewOpenStatus", variant: "pending" };
		case "agreed":
			return { key: "secondReviewAgree", variant: "neutral" };
		case "disagreed":
			return { key: "secondReviewDisagree", variant: "danger" };
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
			return "secondReviewClosed";
		case 404:
			return "secondReviewMissing";
		default:
			return "tryAgain";
	}
}

export default function SecondReviewPage() {
	const { locale, t } = useI18n();
	const online = useOnline();
	const { id = "" } = useParams();
	const review = useEngine(
		"/second-reviews/:id",
		{ query: { id } },
		{ enabled: Boolean(id) },
	);
	const close = useEngineMutation("/second-reviews/:id/close");
	const [outcome, setOutcome] = useState<SecondOutcome>("agreed");
	const [note, setNote] = useState("");
	const [error, setError] = useState<MessageKey | null>(null);

	async function onSave(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		try {
			await close.mutateAsync({ body: { id, outcome, note } });
			setNote("");
			await review.invalidate();
		} catch (caught) {
			setError(closeError(caught));
		}
	}

	if (review.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(review.error) && review.error.status === 404) {
		return (
			<p className="font-sans text-lg font-medium text-fg">
				{t("secondReviewMissing")}
			</p>
		);
	}
	if (isApiClientError(review.error) && review.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("homeUnavailable")}
			</p>
		);
	}
	if (review.error || !review.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const row = review.data as SecondReviewDetail;
	const badge = outcomeBadge(row.status);
	const title = textFor(locale, row.taskTitleRw, row.taskTitleEn);
	const instructions = textFor(locale, row.instructionsRw, row.instructionsEn);
	const learner = row.learnerName.trim() || t("learnerUnnamed");

	return (
		<div className="mx-auto flex max-w-3xl flex-col gap-8">
			<Link
				to="/second-reviews"
				className="font-sans text-sm font-semibold text-fg"
			>
				{t("secondReviewsTitle")}
			</Link>
			<div className="flex flex-col gap-3">
				<div className="flex flex-wrap items-center gap-3">
					<h1 className="font-sans text-4xl font-semibold leading-tight text-fg">
						{title || t("secondReviewTitle")}
					</h1>
					<Badge variant={badge.variant}>{t(badge.key)}</Badge>
				</div>
				<p className="font-sans text-lg text-fg">
					{learner} · {row.centerName}
				</p>
				<p className="max-w-xl font-sans text-lg font-medium text-fg">
					{t("secondReviewSentence")}
				</p>
				{online ? null : (
					<p className="font-sans text-lg text-fg">
						{t("secondReviewOffline")}
					</p>
				)}
			</div>
			{instructions ? (
				<p className="font-sans text-lg text-fg">{instructions}</p>
			) : null}
			{row.learnerNote ? (
				<div className="flex flex-col gap-2">
					<p className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("evidenceNoteLabel")}
					</p>
					<p className="font-sans text-lg text-fg">{row.learnerNote}</p>
				</div>
			) : null}
			{row.status === "open" ? (
				<form
					className="flex flex-col gap-4"
					onSubmit={(event) => void onSave(event)}
				>
					<fieldset className="flex flex-col gap-3">
						<legend className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("secondReviewOutcome")}
						</legend>
						<label className="flex items-center gap-3 font-sans text-lg text-fg">
							<input
								type="radio"
								name="outcome"
								value="agreed"
								checked={outcome === "agreed"}
								onChange={() => setOutcome("agreed")}
							/>
							{t("secondReviewAgree")}
						</label>
						<label className="flex items-center gap-3 font-sans text-lg text-fg">
							<input
								type="radio"
								name="outcome"
								value="disagreed"
								checked={outcome === "disagreed"}
								onChange={() => setOutcome("disagreed")}
							/>
							{t("secondReviewDisagree")}
						</label>
					</fieldset>
					<label className="flex flex-col gap-2" htmlFor="second-review-note">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("secondReviewNote")}
						</span>
						<textarea
							id="second-review-note"
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
						{t("secondReviewSave")}
					</Button>
				</form>
			) : row.note ? (
				<p className="font-sans text-lg text-fg">{row.note}</p>
			) : null}
		</div>
	);
}
