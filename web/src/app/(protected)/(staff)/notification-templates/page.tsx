import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isApiClientError, useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";

type Template = {
	id: string;
	eventName: string;
	channel: string;
	locale: string;
	title: string;
	body: string;
};

function reasonKey(error: unknown): MessageKey {
	if (!isApiClientError(error)) return "tryAgain";
	const reason = (error.details as { reason?: string } | undefined)?.reason;
	switch (reason) {
		case "title":
			return "templatesTitleField";
		case "body":
			return "templatesBody";
		default:
			return "tryAgain";
	}
}

export default function NotificationTemplatesPage() {
	const { t } = useI18n();
	const templates = useEngine("/notification-templates");
	const save = useEngineMutation("/notification-templates/update");
	const [selected, setSelected] = useState("");
	const [title, setTitle] = useState("");
	const [body, setBody] = useState("");
	const [error, setError] = useState<MessageKey | null>(null);

	if (templates.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(templates.error) && templates.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("homeUnavailable")}
			</p>
		);
	}
	if (templates.error || !templates.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const rows = templates.data as Template[];

	function choose(id: string) {
		const row = rows.find((item) => item.id === id);
		setSelected(id);
		setTitle(row?.title ?? "");
		setBody(row?.body ?? "");
		setError(null);
	}

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		if (!selected) return;
		try {
			await save.mutateAsync({ body: { id: selected, title, body } });
			await templates.invalidate();
		} catch (caught) {
			setError(reasonKey(caught));
		}
	}

	return (
		<div className="mx-auto flex max-w-3xl flex-col gap-8">
			<div className="flex flex-col gap-3">
				<h1 className="font-sans text-4xl font-semibold leading-tight text-fg sm:text-5xl">
					{t("templatesTitle")}
				</h1>
				<p className="text-lg text-fg">{t("templatesLead")}</p>
			</div>
			{rows.length === 0 ? (
				<p className="text-lg text-fg">{t("templatesEmpty")}</p>
			) : (
				<form
					className="flex flex-col gap-4"
					onSubmit={(event) => void onSubmit(event)}
				>
					<label className="flex flex-col gap-2" htmlFor="template-choice">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("templatesTitle")}
						</span>
						<select
							id="template-choice"
							className="h-10 w-full rounded-xl border border-line-strong bg-surface px-3.5 text-sm text-fg"
							value={selected}
							disabled={save.isPending}
							onChange={(event) => choose(event.target.value)}
						>
							<option value="">{t("templatesEmpty")}</option>
							{rows.map((row) => (
								<option key={row.id} value={row.id}>
									{row.eventName} · {row.channel} · {row.locale}
								</option>
							))}
						</select>
					</label>
					<label className="flex flex-col gap-2" htmlFor="template-title">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("templatesTitleField")}
						</span>
						<Input
							id="template-title"
							value={title}
							disabled={save.isPending || !selected}
							onChange={(event) => setTitle(event.target.value)}
						/>
					</label>
					<label className="flex flex-col gap-2" htmlFor="template-body">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("templatesBody")}
						</span>
						<Input
							id="template-body"
							value={body}
							disabled={save.isPending || !selected}
							onChange={(event) => setBody(event.target.value)}
						/>
					</label>
					<Button
						type="submit"
						variant="sticker"
						disabled={save.isPending || !selected}
						className="w-fit"
					>
						{t("templatesSave")}
					</Button>
				</form>
			)}
			{error ? <p className="text-lg text-destructive">{t(error)}</p> : null}
		</div>
	);
}
