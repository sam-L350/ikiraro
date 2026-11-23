import { type FormEvent, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isApiClientError, useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";

type FeedbackLocale = "rw" | "en";

type FeedbackSnippet = {
	id: string;
	locale: FeedbackLocale;
	body: string;
};

function localeKey(locale: FeedbackLocale): MessageKey {
	switch (locale) {
		case "rw":
			return "feedbackKinyarwanda";
		case "en":
			return "feedbackEnglish";
		default: {
			const unreachable: never = locale;
			return unreachable;
		}
	}
}

export default function FeedbackLibraryPage() {
	const { t } = useI18n();
	const library = useEngine("/feedback-snippets");
	const create = useEngineMutation("/feedback-snippets/create");
	const update = useEngineMutation("/feedback-snippets/:id/update");
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [locale, setLocale] = useState<FeedbackLocale>("rw");
	const [body, setBody] = useState("");
	const [error, setError] = useState<MessageKey | null>(null);

	async function onSave(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		try {
			if (selectedId) {
				await update.mutateAsync({ body: { id: selectedId, locale, body } });
			} else {
				await create.mutateAsync({ body: { locale, body } });
				setBody("");
			}
			await library.invalidate();
		} catch {
			setError("tryAgain");
		}
	}

	if (library.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(library.error) && library.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("homeUnavailable")}
			</p>
		);
	}
	if (library.error || !library.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const items = (library.data.items ?? []) as FeedbackSnippet[];
	const pending = create.isPending || update.isPending;

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<div>
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{t("feedbackTitle")}
				</h1>
				<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
					{t("feedbackSentence")}
				</p>
			</div>
			{items.length === 0 ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("feedbackEmpty")}
				</p>
			) : (
				<ul>
					{items.map((item) => (
						<li key={item.id} className="border-t border-ink/15 py-4">
							<button
								type="button"
								className="flex w-full flex-col items-start gap-2 text-left"
								onClick={() => {
									setSelectedId(item.id);
									setLocale(item.locale);
									setBody(item.body);
									setError(null);
								}}
							>
								<Badge variant="neutral">{t(localeKey(item.locale))}</Badge>
								<p className="font-sans text-lg text-fg">{item.body}</p>
							</button>
						</li>
					))}
				</ul>
			)}
			<form
				className="flex flex-col gap-4"
				onSubmit={(event) => void onSave(event)}
			>
				{selectedId ? (
					<Button
						type="button"
						variant="quiet"
						className="w-fit"
						onClick={() => {
							setSelectedId(null);
							setBody("");
							setError(null);
						}}
					>
						{t("feedbackNew")}
					</Button>
				) : null}
				<fieldset className="flex flex-col gap-3">
					<legend className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("feedbackLocale")}
					</legend>
					<label className="flex items-center gap-3 font-sans text-lg text-fg">
						<input
							type="radio"
							name="locale"
							value="rw"
							checked={locale === "rw"}
							onChange={() => setLocale("rw")}
						/>
						{t("feedbackKinyarwanda")}
					</label>
					<label className="flex items-center gap-3 font-sans text-lg text-fg">
						<input
							type="radio"
							name="locale"
							value="en"
							checked={locale === "en"}
							onChange={() => setLocale("en")}
						/>
						{t("feedbackEnglish")}
					</label>
				</fieldset>
				<label className="flex flex-col gap-2" htmlFor="feedback-body">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("feedbackBody")}
					</span>
					<textarea
						id="feedback-body"
						className="min-h-24 rounded-md border border-line bg-card px-3 py-3 font-sans text-lg text-fg"
						value={body}
						disabled={pending}
						onChange={(event) => setBody(event.target.value)}
					/>
				</label>
				{error ? (
					<p className="font-sans text-sm font-medium text-danger" role="alert">
						{t(error)}
					</p>
				) : null}
				<Button
					type="submit"
					variant="sticker"
					className="w-fit"
					disabled={pending || body.trim().length === 0}
				>
					{t("feedbackSave")}
				</Button>
			</form>
		</section>
	);
}
