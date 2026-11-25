import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RecordTable } from "@/components/ui/record-table";
import {
	invalidateEngine,
	isApiClientError,
	useEngine,
	useEngineMutation,
} from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

type WebhookRow = {
	id: string;
	url: string;
	event: string;
	createdAt: string;
};

function eventLabel(
	value: string,
	t: (key: "webhooksCredential" | "webhooksGrant") => string,
): string {
	switch (value) {
		case "credential.awarded":
			return t("webhooksCredential");
		case "grant.decided":
			return t("webhooksGrant");
		default:
			return value;
	}
}

export default function WebhooksPage() {
	const { t } = useI18n();
	const list = useEngine("/webhooks");
	const save = useEngineMutation("/webhooks/create");
	const [url, setUrl] = useState("");
	const [event, setEvent] = useState("");
	const [error, setError] = useState<string | null>(null);

	if (list.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(list.error) && list.error.status === 403) {
		return (
			<p className="font-sans text-lg font-medium text-fg">
				{t("webhooksDenied")}
			</p>
		);
	}
	if (list.error || !list.data) {
		return <p className="font-sans text-lg text-fg">{t("tryAgain")}</p>;
	}

	const hooks = list.data.hooks as WebhookRow[];
	const ready = url.trim().length > 0 && event.length > 0;

	async function onSave() {
		if (!ready) return;
		setError(null);
		try {
			await save.mutateAsync({ body: { url: url.trim(), event } });
			setUrl("");
			setEvent("");
			await invalidateEngine("/webhooks");
		} catch (caught) {
			setError(isApiClientError(caught) ? caught.message : t("tryAgain"));
		}
	}

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<div>
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{t("webhooksTitle")}
				</h1>
				<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
					{t("webhooksSentence")}
				</p>
			</div>
			{hooks.length === 0 ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("webhooksEmpty")}
				</p>
			) : (
				<RecordTable
					caption={t("webhooksTitle")}
					columns={[t("webhooksUrl"), t("webhooksEvent")]}
					rows={hooks.map((hook) => ({
						key: hook.id,
						cells: [hook.url, eventLabel(hook.event, t)],
					}))}
				/>
			)}
			<div className="flex max-w-xl flex-col gap-4 rounded-[20px] bg-surface p-5 sm:p-6">
				<label className="flex flex-col gap-2" htmlFor="webhook-url">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("webhooksUrl")}
					</span>
					<Input
						id="webhook-url"
						value={url}
						maxLength={200}
						onChange={(change) => setUrl(change.target.value)}
					/>
				</label>
				<label className="flex flex-col gap-2" htmlFor="webhook-event">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("webhooksEvent")}
					</span>
					<select
						id="webhook-event"
						className="h-11 rounded-xl border border-line-strong bg-canvas px-3 font-sans text-lg text-fg"
						value={event}
						onChange={(change) => setEvent(change.target.value)}
					>
						<option value="">{t("webhooksChoose")}</option>
						<option value="credential.awarded">
							{t("webhooksCredential")}
						</option>
						<option value="grant.decided">{t("webhooksGrant")}</option>
					</select>
				</label>
				{error ? (
					<p className="font-sans text-lg text-danger" role="alert">
						{error}
					</p>
				) : null}
				{ready ? (
					<Button
						type="button"
						variant={hooks.length === 0 ? "ink" : "soft"}
						className="w-fit"
						disabled={save.isPending}
						onClick={() => void onSave()}
					>
						{t("webhooksSave")}
					</Button>
				) : null}
			</div>
		</section>
	);
}
