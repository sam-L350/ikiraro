import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { callEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { useOnline } from "@/lib/offline/use-online";

const FIELDS = [
	{ id: "name", label: "correctionName" },
	{ id: "district", label: "correctionDistrict" },
	{ id: "sector", label: "correctionSector" },
	{ id: "village", label: "correctionVillage" },
	{ id: "economicSector", label: "correctionWork" },
	{ id: "guardianContact", label: "correctionGuardian" },
] as const;

export function SubjectTools() {
	const { t } = useI18n();
	const online = useOnline();
	const correct = useEngineMutation("/privacy/correction");
	const [field, setField] = useState<(typeof FIELDS)[number]["id"]>("name");
	const [value, setValue] = useState("");
	const [notice, setNotice] = useState<MessageKey | null>(null);
	const [error, setError] = useState<MessageKey | null>(null);

	async function onDownload() {
		setError(null);
		const packet = await callEngine("/privacy/export");
		const blob = new Blob([JSON.stringify(packet, null, 2)], {
			type: "application/json",
		});
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = "ikiraro-record.json";
		link.click();
		URL.revokeObjectURL(url);
	}

	async function onCorrect() {
		setError(null);
		setNotice(null);
		try {
			await correct.mutateAsync({ body: { field, value } });
			setValue("");
			setNotice("correctionSaved");
		} catch {
			setError("tryAgain");
		}
	}

	return (
		<section className="mt-12 flex flex-col items-start gap-4">
			<h2 className="font-sans text-2xl font-semibold text-fg">
				{t("downloadRecord")}
			</h2>
			<p className="font-sans text-lg text-fg">{t("correctionLead")}</p>
			{online ? null : (
				<p className="font-sans text-lg text-fg">{t("offlineDecision")}</p>
			)}
			<Button
				type="button"
				variant="quiet"
				className="px-0"
				disabled={!online}
				onClick={() => void onDownload()}
			>
				{t("downloadRecord")}
			</Button>
			<label
				className="flex w-full max-w-xl flex-col gap-2"
				htmlFor="correction-field"
			>
				<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
					{t("correctionField")}
				</span>
				<select
					id="correction-field"
					className="h-11 w-full rounded-xl border border-line-strong bg-surface px-3 font-sans text-fg"
					value={field}
					onChange={(event) => {
						const next = FIELDS.find((item) => item.id === event.target.value);
						if (next) setField(next.id);
					}}
				>
					{FIELDS.map((item) => (
						<option key={item.id} value={item.id}>
							{t(item.label)}
						</option>
					))}
				</select>
			</label>
			<label
				className="flex w-full max-w-xl flex-col gap-2"
				htmlFor="correction-value"
			>
				<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
					{t("correctionValue")}
				</span>
				<Input
					id="correction-value"
					value={value}
					disabled={!online || correct.isPending}
					onChange={(event) => setValue(event.target.value)}
				/>
			</label>
			<Button
				type="button"
				variant="quiet"
				className="px-0"
				disabled={!online || correct.isPending}
				onClick={() => void onCorrect()}
			>
				{t("correctionSave")}
			</Button>
			{notice ? <p className="font-sans text-lg text-fg">{t(notice)}</p> : null}
			{error ? (
				<p className="font-sans text-sm font-medium text-danger" role="alert">
					{t(error)}
				</p>
			) : null}
		</section>
	);
}
