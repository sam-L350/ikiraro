import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Switch } from "@/components/ui/switch";
import { isApiClientError, useEngine, useEngineMutation } from "@/lib/engine";
import { eventTitle } from "@/lib/event-title";
import { useI18n } from "@/lib/i18n";

type Delivery = "queued" | "submitted" | "sent" | "failed" | "capped" | "none";

type InboxItem = {
	id: string;
	eventName: string;
	title: string;
	body: string;
	createdAt: string;
	readAt: string | null;
	sms: Delivery;
	email: Delivery;
};

type Preference = {
	eventName: string;
	inApp: boolean;
	sms: boolean;
	email: boolean;
};

const CHANNELS = [
	{ id: "in_app", label: "prefInApp" },
	{ id: "sms", label: "prefSms" },
	{ id: "email", label: "prefEmail" },
] as const;

function channelOn(
	choice: Preference,
	channel: (typeof CHANNELS)[number]["id"],
) {
	switch (channel) {
		case "in_app":
			return choice.inApp;
		case "sms":
			return choice.sms;
		case "email":
			return choice.email;
		default: {
			const unreachable: never = channel;
			return unreachable;
		}
	}
}

export default function InboxPage() {
	const { t } = useI18n();
	const inbox = useEngine("/notifications");
	const preferences = useEngine("/notification-preferences");
	const markRead = useEngineMutation("/notifications/:id/read");
	const savePreference = useEngineMutation("/notification-preferences/update");

	if (inbox.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(inbox.error) && inbox.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("homeUnavailable")}
			</p>
		);
	}
	if (inbox.error || !inbox.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const items = inbox.data as InboxItem[];
	const choices = (preferences.data ?? []) as Preference[];
	const busy = markRead.isPending || savePreference.isPending;

	async function refresh() {
		await Promise.all([inbox.invalidate(), preferences.invalidate()]);
	}

	async function onRead(id: string) {
		await markRead.mutateAsync({ body: { id } });
		await inbox.invalidate();
	}

	async function onPreference(
		eventName: string,
		channel: "in_app" | "sms" | "email",
		enabled: boolean,
	) {
		await savePreference.mutateAsync({
			body: { eventName, channel, enabled },
		});
		await preferences.invalidate();
	}

	function deliveryNotes(item: InboxItem): string[] {
		const notes: string[] = [];
		if (item.sms === "queued") notes.push(t("inboxSmsQueued"));
		if (item.sms === "submitted") notes.push(t("inboxSmsSubmitted"));
		if (item.sms === "capped") notes.push(t("inboxSmsDailyCap"));
		if (item.sms === "failed") notes.push(t("inboxSmsFailed"));
		if (item.email === "queued") notes.push(t("inboxEmailQueued"));
		if (item.email === "failed") notes.push(t("inboxEmailFailed"));
		return notes;
	}

	return (
		<div className="mx-auto flex max-w-3xl flex-col gap-8">
			<div className="flex flex-col gap-3">
				<h1 className="font-sans text-4xl font-semibold leading-tight text-fg sm:text-5xl">
					{t("inboxTitle")}
				</h1>
				<p className="text-lg text-fg">{t("inboxLead")}</p>
				<Button
					type="button"
					variant="quiet"
					className="w-fit"
					onClick={() => void refresh()}
				>
					{t("inboxRefresh")}
				</Button>
			</div>
			{items.length === 0 ? (
				<EmptyState sentence={t("inboxEmpty")} />
			) : (
				<ul className="flex flex-col gap-3">
					{items.map((item) => {
						const notes = deliveryNotes(item);
						const failed = item.sms === "failed" || item.email === "failed";
						return (
							<li
								key={item.id}
								className="flex flex-col gap-3 rounded-[20px] bg-surface p-5"
							>
								<div className="flex items-start justify-between gap-4">
									<div className="flex flex-col gap-1">
										<p className="font-sans text-lg font-semibold text-fg">
											{item.title}
										</p>
										<p className="font-sans text-base font-medium text-fg">
											{item.body}
										</p>
										{notes.map((note) => (
											<p
												key={note}
												className={
													failed
														? "font-sans text-sm font-medium text-destructive"
														: "font-sans text-sm font-medium text-fg-muted"
												}
											>
												{note}
											</p>
										))}
									</div>
									{item.readAt ? null : (
										<Badge variant="pending">{t("inboxUnread")}</Badge>
									)}
								</div>
								{item.readAt ? null : (
									<Button
										type="button"
										variant="quiet"
										className="w-fit"
										disabled={busy}
										onClick={() => void onRead(item.id)}
									>
										{t("inboxMarkRead")}
									</Button>
								)}
							</li>
						);
					})}
				</ul>
			)}
			{choices.length === 0 ? null : (
				<section className="rounded-[20px] bg-surface p-5 sm:p-6">
					<h2 className="font-sans text-2xl font-semibold text-fg">
						{t("inboxPrefTitle")}
					</h2>
					<p className="mt-2 max-w-xl font-sans text-base font-medium text-fg">
						{t("inboxPrefLead")}
					</p>
					<div className="mt-6 hidden sm:grid sm:grid-cols-[minmax(0,1fr)_repeat(3,6.5rem)] sm:px-1">
						<span />
						{CHANNELS.map((channel) => (
							<span
								key={channel.id}
								className="text-center font-meta text-xs font-semibold uppercase tracking-wide text-fg-muted"
							>
								{t(channel.label)}
							</span>
						))}
					</div>
					<ul className="mt-2 flex flex-col">
						{choices.map((choice) => {
							const title = eventTitle(choice.eventName);
							const name = title ? t(title) : choice.eventName;
							return (
								<li
									key={choice.eventName}
									className="grid gap-3 border-t border-line py-4 sm:grid-cols-[minmax(0,1fr)_repeat(3,6.5rem)] sm:items-center"
								>
									<p className="font-sans text-lg font-semibold text-fg">
										{name}
									</p>
									{CHANNELS.map((channel) => {
										const on = channelOn(choice, channel.id);
										return (
											<div
												key={channel.id}
												className="flex items-center justify-between gap-3 sm:flex-col sm:justify-center"
											>
												<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg-muted sm:sr-only">
													{t(channel.label)}
												</span>
												<Switch
													checked={on}
													disabled={busy}
													label={`${name}, ${t(channel.label)}, ${on ? t("prefOn") : t("prefOff")}`}
													onToggle={() =>
														void onPreference(choice.eventName, channel.id, !on)
													}
												/>
												<span className="w-8 font-meta text-xs font-semibold uppercase text-fg">
													{on ? t("prefOn") : t("prefOff")}
												</span>
											</div>
										);
									})}
								</li>
							);
						})}
					</ul>
				</section>
			)}
		</div>
	);
}
