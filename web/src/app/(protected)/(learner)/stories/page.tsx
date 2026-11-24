import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	callEngine,
	invalidateEngine,
	useEngine,
	useEngineMutation,
} from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import { prepareEvidenceFile } from "@/lib/media/prepare";

async function uploadImage(file: File): Promise<string | null> {
	const prepared = await prepareEvidenceFile(file);
	if (prepared === "too_large" || prepared === "type") return null;
	if (!prepared.contentType.startsWith("image/")) return null;
	const intent = await callEngine("/media/upload-intent", {
		body: { contentType: prepared.contentType, byteSize: prepared.bytes.size },
	});
	const put = await fetch(intent.uploadUrl, {
		method: "PUT",
		headers: { "content-type": intent.contentType },
		body: prepared.bytes,
		credentials: "omit",
	});
	if (!put.ok) return null;
	const finalized = await callEngine("/media/:id/finalize", {
		body: { id: intent.id, sha256: prepared.sha256 },
	});
	return finalized.id;
}

export default function StoriesPage() {
	const { t } = useI18n();
	const story = useEngine("/success-stories");
	const consent = useEngineMutation("/consents");
	const save = useEngineMutation("/success-stories/create");
	const [body, setBody] = useState("");
	const [file, setFile] = useState<File | null>(null);
	const [formError, setFormError] = useState<string | null>(null);
	const ready = body.trim() !== "" && file !== null;

	if (story.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (story.error || !story.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	async function onAllow(granted: boolean) {
		setFormError(null);
		try {
			await consent.mutateAsync({
				body: { purpose: "success_story", granted },
			});
			await invalidateEngine("/success-stories");
			await invalidateEngine("/profile");
		} catch (error) {
			setFormError(error instanceof Error ? error.message : t("tryAgain"));
		}
	}

	async function onSave(event: FormEvent) {
		event.preventDefault();
		if (!ready || !file) return;
		setFormError(null);
		try {
			const mediaId = await uploadImage(file);
			if (!mediaId) {
				setFormError(t("tryAgain"));
				return;
			}
			await save.mutateAsync({ body: { body: body.trim(), mediaId } });
			setBody("");
			setFile(null);
			await invalidateEngine("/success-stories");
		} catch (error) {
			setFormError(error instanceof Error ? error.message : t("tryAgain"));
		}
	}

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<div>
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{t("storiesTitle")}
				</h1>
				<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
					{t("storiesSentence")}
				</p>
			</div>
			{story.data.minor ? (
				<p className="font-sans text-lg text-fg">{t("storiesMinor")}</p>
			) : story.data.allowed ? (
				<Button
					type="button"
					variant="quiet"
					className="w-fit"
					onClick={() => void onAllow(false)}
				>
					{t("storiesWithdraw")}
				</Button>
			) : (
				<Button
					type="button"
					variant="ink"
					className="w-fit"
					onClick={() => void onAllow(true)}
				>
					{t("storiesAllow")}
				</Button>
			)}
			{story.data.body ? (
				<p className="font-sans text-lg text-fg">{story.data.body}</p>
			) : null}
			{story.data.photoUrl ? (
				<img
					src={story.data.photoUrl}
					alt=""
					className="max-h-64 w-auto rounded-md border border-line"
				/>
			) : null}
			{story.data.allowed ? (
				<form
					className="flex flex-col gap-4"
					onSubmit={(event) => void onSave(event)}
				>
					<label className="flex flex-col gap-2" htmlFor="story-body">
						<span className="font-meta text-xs uppercase text-fg-muted">
							{t("storiesBody")}
						</span>
						<textarea
							id="story-body"
							className="min-h-28 rounded-md border border-line bg-card px-3 py-2 font-sans text-lg text-fg"
							value={body}
							onChange={(event) => setBody(event.target.value)}
						/>
					</label>
					<label className="flex flex-col gap-2" htmlFor="story-photo">
						<span className="font-meta text-xs uppercase text-fg-muted">
							{t("storiesPhoto")}
						</span>
						<input
							id="story-photo"
							type="file"
							accept="image/*"
							onChange={(event) => setFile(event.target.files?.[0] ?? null)}
						/>
					</label>
					{ready ? (
						<Button type="submit" variant="ink" className="w-fit">
							{t("storiesSave")}
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
