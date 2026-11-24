import { type FormEvent, useState } from "react";
import { useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { callEngine, useEngineMutation } from "@/lib/engine";
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

export default function FollowUpEvidencePage() {
	const { t } = useI18n();
	const { id = "" } = useParams();
	const send = useEngineMutation("/follow-ups/:id/evidence");
	const [note, setNote] = useState("");
	const [file, setFile] = useState<File | null>(null);

	async function onSend(event: FormEvent) {
		event.preventDefault();
		if (!file) return;
		const mediaId = await uploadImage(file);
		if (!mediaId) return;
		send.mutate({ body: { id, mediaId, note } });
	}

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
				{t("followUpsEvidence")}
			</h1>
			<form
				className="flex flex-col gap-4"
				onSubmit={(event) => void onSend(event)}
			>
				<label className="flex flex-col gap-2">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("followUpsNote")}
					</span>
					<textarea
						className="min-h-28 rounded-md border border-ink/20 bg-paper px-3 py-3 font-sans text-lg text-fg"
						value={note}
						onChange={(event) => setNote(event.target.value)}
					/>
				</label>
				<input
					type="file"
					accept="image/*"
					onChange={(event) => setFile(event.target.files?.[0] ?? null)}
				/>
				<Button
					type="submit"
					className="w-fit"
					disabled={send.isPending || !file}
				>
					{t("followUpsEvidenceSave")}
				</Button>
			</form>
		</section>
	);
}
