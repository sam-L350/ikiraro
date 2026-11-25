import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isApiClientError, useEngine, useEngineMutation } from "@/lib/engine";
import { eventTitle } from "@/lib/event-title";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

type Template = {
	id: string;
	eventName: string;
	channel: string;
	locale: string;
	title: string;
	body: string;
};

function channelName(
	channel: string,
	t: (key: "prefInApp" | "prefSms" | "prefEmail") => string,
): string {
	switch (channel) {
		case "in_app":
			return t("prefInApp");
		case "sms":
			return t("prefSms");
		case "email":
			return t("prefEmail");
		default:
			return channel;
	}
}

function localeName(
	locale: string,
	t: (key: "english" | "kinyarwanda") => string,
): string {
	switch (locale) {
		case "en":
			return t("english");
		case "rw":
			return t("kinyarwanda");
		default:
			return locale;
	}
}

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
				<p className="font-sans text-lg font-medium text-fg">
					{t("templatesEmpty")}
				</p>
			) : (
				<div className="grid items-start gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
					<ul className="flex flex-col gap-2">
						{rows.map((row) => {
							const titleKey = eventTitle(row.eventName);
							const active = selected === row.id;
							return (
								<li key={row.id}>
									<button
										type="button"
										aria-pressed={active}
										disabled={save.isPending}
										onClick={() => choose(row.id)}
										className={cn(
											"flex w-full flex-col gap-1 rounded-[20px] px-5 py-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
											active ? "bg-surface ring-2 ring-ink" : "bg-surface",
										)}
									>
										<span className="font-sans text-lg font-semibold text-fg">
											{titleKey ? t(titleKey) : row.eventName}
										</span>
										<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg-muted">
											{channelName(row.channel, t)} ·{" "}
											{localeName(row.locale, t)}
										</span>
										<span className="font-sans text-sm font-medium text-fg">
											{row.title}
										</span>
									</button>
								</li>
							);
						})}
					</ul>
					<form
						className="flex flex-col gap-4 rounded-[20px] bg-surface p-5 sm:p-6"
						onSubmit={(event) => void onSubmit(event)}
					>
						<p className="font-sans text-lg font-semibold text-fg">
							{t("templatesChoose")}
						</p>
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
							<textarea
								id="template-body"
								value={body}
								disabled={save.isPending || !selected}
								onChange={(event) => setBody(event.target.value)}
								className="min-h-32 w-full rounded-xl border border-line-strong bg-canvas px-3 py-2 font-sans text-base text-fg"
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
				</div>
			)}
			{error ? <p className="text-lg text-destructive">{t(error)}</p> : null}
		</div>
	);
}
