import { type FormEvent, useState } from "react";
import { Link, useParams } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	callEngine,
	isApiClientError,
	useEngine,
	useEngineMutation,
} from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { prepareEvidenceFile } from "@/lib/media/prepare";
import { useOnline } from "@/lib/offline/use-online";

type HandoverPreview = {
	itemName: string;
	serial: string;
	category: string;
	donor: string | null;
	centerName: string;
	recipientName: string;
	awardedOn: string;
};

type HandoverDetail = {
	id: string;
	recorded: boolean;
	preview: HandoverPreview;
	form: (HandoverPreview & { witnessName: string }) | null;
	acknowledgment: "signature" | "otp" | null;
	witnesses: { id: number; name: string }[];
	trail: {
		id: string;
		status: string;
		centerName: string;
		holderName: string | null;
		recordedAt: string;
	}[];
};

type InventoryStatus =
	| "in_stock"
	| "reserved"
	| "awarded"
	| "in_repair"
	| "lost"
	| "retired";

function isStatus(value: string): value is InventoryStatus {
	switch (value) {
		case "in_stock":
		case "reserved":
		case "awarded":
		case "in_repair":
		case "lost":
		case "retired":
			return true;
		default:
			return false;
	}
}

function statusKey(status: InventoryStatus): MessageKey {
	switch (status) {
		case "in_stock":
			return "inventoryInStock";
		case "reserved":
			return "inventoryReserved";
		case "awarded":
			return "inventoryAwarded";
		case "in_repair":
			return "inventoryInRepair";
		case "lost":
			return "inventoryLost";
		case "retired":
			return "inventoryRetired";
		default: {
			const unreachable: never = status;
			return unreachable;
		}
	}
}

async function uploadImage(file: File): Promise<string | null> {
	const prepared = await prepareEvidenceFile(file);
	if (prepared === "too_large" || prepared === "type") return null;
	if (!prepared.contentType.startsWith("image/")) return null;
	const intent = await callEngine("/media/upload-intent", {
		body: {
			contentType: prepared.contentType,
			byteSize: prepared.bytes.size,
		},
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

export default function HandoverPage() {
	const { t } = useI18n();
	const online = useOnline();
	const { id = "" } = useParams();
	const handover = useEngine(
		"/handovers/:id",
		{ query: { id } },
		{ enabled: Boolean(id) },
	);
	const record = useEngineMutation("/handovers/:id/record");
	const code = useEngineMutation("/handovers/:id/code");
	const [witnessId, setWitnessId] = useState("");
	const [acknowledgment, setAcknowledgment] = useState("");
	const [otp, setOtp] = useState("");
	const [signatureId, setSignatureId] = useState("");
	const [photoId, setPhotoId] = useState("");
	const [error, setError] = useState<MessageKey | null>(null);
	const detail = handover.data as HandoverDetail | undefined;
	const shown = detail?.form ?? detail?.preview;

	async function onFile(
		file: File | undefined,
		setId: (value: string) => void,
	) {
		setError(null);
		if (!file || !online) {
			setError("tryAgain");
			return;
		}
		try {
			const mediaId = await uploadImage(file);
			if (!mediaId) {
				setError("tryAgain");
				return;
			}
			setId(mediaId);
		} catch {
			setError("tryAgain");
		}
	}

	async function onSendCode() {
		setError(null);
		if (!online || !detail) {
			setError("tryAgain");
			return;
		}
		try {
			await code.mutateAsync({ body: { id: detail.id } });
		} catch {
			setError("tryAgain");
		}
	}

	async function onRecord(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		if (
			!online ||
			!detail ||
			!witnessId ||
			!photoId ||
			(acknowledgment !== "signature" && acknowledgment !== "otp") ||
			(acknowledgment === "signature" && !signatureId) ||
			(acknowledgment === "otp" && !otp.trim())
		) {
			setError("tryAgain");
			return;
		}
		try {
			await record.mutateAsync({
				body: {
					id: detail.id,
					witnessUserId: Number(witnessId),
					acknowledgment,
					photoMediaId: photoId,
					...(acknowledgment === "signature"
						? { signatureMediaId: signatureId }
						: { code: otp.trim() }),
				},
			});
			await handover.invalidate();
		} catch {
			setError("tryAgain");
		}
	}

	if (!id || handover.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(handover.error) && handover.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("handoverDenied")}
			</p>
		);
	}
	if (handover.error || !detail || !shown) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("handoverMissing")}
			</p>
		);
	}

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<div>
				<Link
					to="/handovers"
					className="font-sans text-sm font-semibold text-fg"
				>
					{t("handoverTitle")}
				</Link>
				<h1 className="mt-3 font-sans text-4xl font-semibold text-balance text-fg">
					{shown.itemName}
				</h1>
				<p className="mt-4 font-sans text-lg font-medium text-fg">
					{t("handoverSerial")}: {shown.serial}
				</p>
				<p className="font-sans text-lg font-medium text-fg">
					{t("handoverDonor")}: {shown.donor ?? shown.centerName}
				</p>
				<p className="font-sans text-lg font-medium text-fg">
					{shown.centerName} · {t("handoverRecipient")}: {shown.recipientName}
				</p>
				{detail.form ? (
					<p className="mt-2 font-sans text-lg font-medium text-fg">
						{t("handoverWitness")}: {detail.form.witnessName}
					</p>
				) : null}
				{detail.recorded ? (
					<p className="mt-4 font-sans text-lg font-medium text-fg">
						{t("handoverRecorded")}
					</p>
				) : null}
			</div>
			{detail.recorded ? null : (
				<form
					className="flex flex-col gap-4"
					onSubmit={(event) => void onRecord(event)}
				>
					{detail.witnesses.length === 0 ? (
						<p className="font-sans text-lg font-medium text-fg">
							{t("handoverNoWitness")}
						</p>
					) : (
						<label className="flex flex-col gap-2" htmlFor="handover-witness">
							<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
								{t("handoverWitness")}
							</span>
							<select
								id="handover-witness"
								className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
								value={witnessId}
								onChange={(event) => setWitnessId(event.target.value)}
							>
								<option value="">{t("handoverWitness")}</option>
								{detail.witnesses.map((person) => (
									<option key={person.id} value={String(person.id)}>
										{person.name}
									</option>
								))}
							</select>
						</label>
					)}
					<label className="flex flex-col gap-2" htmlFor="handover-ack">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("handoverAck")}
						</span>
						<select
							id="handover-ack"
							className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
							value={acknowledgment}
							onChange={(event) => setAcknowledgment(event.target.value)}
						>
							<option value="">{t("handoverAck")}</option>
							<option value="signature">{t("handoverSignature")}</option>
							<option value="otp">{t("handoverOtp")}</option>
						</select>
					</label>
					{acknowledgment === "signature" ? (
						<label className="flex flex-col gap-2" htmlFor="handover-signature">
							<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
								{t("handoverSignature")}
							</span>
							<input
								id="handover-signature"
								type="file"
								accept="image/*"
								className="font-sans text-lg text-fg"
								onChange={(event) =>
									void onFile(event.target.files?.[0], setSignatureId)
								}
							/>
						</label>
					) : null}
					{acknowledgment === "otp" ? (
						<div className="flex flex-col gap-3">
							<Button
								type="button"
								variant="quiet"
								className="w-fit"
								disabled={code.isPending}
								onClick={() => void onSendCode()}
							>
								{t("handoverSend")}
							</Button>
							<label className="flex flex-col gap-2" htmlFor="handover-code">
								<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
									{t("handoverCode")}
								</span>
								<input
									id="handover-code"
									inputMode="numeric"
									className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
									value={otp}
									onChange={(event) => setOtp(event.target.value)}
								/>
							</label>
						</div>
					) : null}
					<label className="flex flex-col gap-2" htmlFor="handover-photo">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("handoverPhoto")}
						</span>
						<input
							id="handover-photo"
							type="file"
							accept="image/*"
							className="font-sans text-lg text-fg"
							onChange={(event) =>
								void onFile(event.target.files?.[0], setPhotoId)
							}
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
					{detail.witnesses.length > 0 ? (
						<Button
							type="submit"
							variant="sticker"
							className="w-fit"
							disabled={record.isPending}
						>
							{t("handoverSave")}
						</Button>
					) : null}
				</form>
			)}
			<div className="flex flex-col gap-3">
				<h2 className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
					{t("handoverTrail")}
				</h2>
				<p className="font-sans text-lg font-medium text-fg">
					{t("handoverDonor")}: {shown.donor ?? shown.centerName}
				</p>
				<ul>
					{detail.trail.map((entry) => (
						<li
							key={entry.id}
							className="flex flex-wrap items-center gap-3 border-t border-ink/15 py-4"
						>
							{isStatus(entry.status) ? (
								<Badge variant="neutral">{t(statusKey(entry.status))}</Badge>
							) : null}
							<p className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
								{entry.centerName}
								{entry.holderName ? ` · ${entry.holderName}` : ""}
							</p>
						</li>
					))}
				</ul>
			</div>
		</section>
	);
}
