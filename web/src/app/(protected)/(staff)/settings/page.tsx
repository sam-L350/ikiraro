import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isApiClientError, useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { useOnline } from "@/lib/offline/use-online";

type ConfigSetting = {
	key: string;
	version: number;
	value: number | string;
	editable: boolean;
};

function reasonKey(error: unknown): MessageKey {
	if (!isApiClientError(error)) return "tryAgain";
	if (error.status === 404) return "settingsInvalid";
	const reason = (error.details as { reason?: string } | undefined)?.reason;
	switch (reason) {
		case "value":
		case "key":
			return "settingsInvalid";
		default:
			return "tryAgain";
	}
}

export default function SettingsPage() {
	const { t } = useI18n();
	const online = useOnline();
	const list = useEngine("/config");
	const save = useEngineMutation("/config/update");
	const [drafts, setDrafts] = useState<Record<string, string>>({});
	const [message, setMessage] = useState<MessageKey | null>(null);

	if (list.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(list.error) && list.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("homeUnavailable")}
			</p>
		);
	}
	if (list.error || !list.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const rows = list.data as ConfigSetting[];
	const editable = rows.some((row) => row.editable);

	async function onSave(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!online) {
			setMessage("settingsOffline");
			return;
		}
		setMessage(null);
		const changed = rows.filter((row) => {
			if (!row.editable) return false;
			const draft = drafts[row.key];
			if (draft === undefined) return false;
			return draft !== String(row.value);
		});
		if (changed.length === 0) {
			setMessage("settingsUnchanged");
			return;
		}
		try {
			for (const row of changed) {
				const draft = drafts[row.key] ?? "";
				const parsed = Number(draft);
				if (!Number.isInteger(parsed)) {
					setMessage("settingsInvalid");
					return;
				}
				await save.mutateAsync({ body: { key: row.key, value: parsed } });
			}
			setDrafts({});
			setMessage("settingsSaved");
			await list.invalidate();
		} catch (caught) {
			setMessage(reasonKey(caught));
		}
	}

	return (
		<form
			className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-8"
			onSubmit={onSave}
		>
			<div className="flex flex-col gap-2">
				<h1 className="font-sans text-4xl font-semibold text-fg">
					{t("settingsTitle")}
				</h1>
				<p className="font-sans text-lg text-fg-muted">{t("settingsLead")}</p>
			</div>
			{!online ? (
				<p className="font-sans text-lg text-fg">{t("settingsOffline")}</p>
			) : null}
			{rows.length === 0 ? (
				<p className="font-sans text-2xl text-fg">{t("auditEmpty")}</p>
			) : (
				<ul className="flex flex-col gap-6">
					{rows.map((row) => (
						<li key={row.key} className="flex flex-col gap-2">
							<label
								className="font-meta text-xs uppercase text-fg-muted"
								htmlFor={`setting-${row.key}`}
							>
								{row.key}
							</label>
							<p className="font-sans text-sm text-fg-muted">
								{t("settingsVersion", { count: String(row.version) })}
							</p>
							{row.editable ? (
								<Input
									id={`setting-${row.key}`}
									inputMode="numeric"
									value={drafts[row.key] ?? String(row.value)}
									onChange={(event) =>
										setDrafts((current) => ({
											...current,
											[row.key]: event.target.value,
										}))
									}
								/>
							) : (
								<p
									id={`setting-${row.key}`}
									className="font-sans text-lg text-fg"
								>
									{String(row.value)}
								</p>
							)}
						</li>
					))}
				</ul>
			)}
			{message ? (
				<p className="font-sans text-lg text-fg">{t(message)}</p>
			) : null}
			{editable ? (
				<Button
					type="submit"
					className="w-fit"
					disabled={!online || save.isPending}
				>
					{t("settingsSave")}
				</Button>
			) : null}
		</form>
	);
}
