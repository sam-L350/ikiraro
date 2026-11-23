import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isApiClientError, useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";

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

function eventLabel(name: string): MessageKey {
	switch (name) {
		case "submission.created":
			return "eventSubmissionReceived";
		case "submission.approved":
			return "eventReviewApproved";
		case "submission.needs_revision":
			return "eventRevision";
		case "submission.rejected":
			return "eventReviewRejected";
		case "badge.awarded":
			return "eventBadge";
		case "points.adjusted":
			return "eventPoints";
		case "grant.decided":
			return "eventGrant";
		case "follow_up.due":
			return "eventFollowUp";
		case "learner.stalled":
			return "eventStalled";
		case "announcement.posted":
			return "eventAnnouncement";
		default:
			return "inboxTitle";
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

	return (
		<div className="mx-auto flex max-w-3xl flex-col gap-8">
			<div className="flex flex-col gap-3">
				<h1 className="font-sans text-4xl font-semibold leading-tight text-fg sm:text-5xl">
					{t("inboxTitle")}
				</h1>
				<p className="text-lg text-fg">{t("inboxLead")}</p>
				<Button
					type="button"
					variant="sticker"
					className="w-fit"
					onClick={() => void refresh()}
				>
					{t("inboxRefresh")}
				</Button>
			</div>
			{items.length === 0 ? (
				<p className="text-lg text-fg">{t("inboxEmpty")}</p>
			) : (
				<ul className="flex flex-col">
					{items.map((item) => (
						<li
							key={item.id}
							className="flex flex-col gap-2 border-b border-line py-4"
						>
							<div className="flex flex-wrap items-center gap-3">
								<p className="text-lg text-fg">{item.title}</p>
								{item.readAt ? null : (
									<Badge variant="pending">{t("inboxUnread")}</Badge>
								)}
							</div>
							<p className="text-lg text-fg">{item.body}</p>
							{item.sms === "queued" ? (
								<p className="text-lg text-fg-muted">{t("inboxSmsQueued")}</p>
							) : null}
							{item.sms === "submitted" ? (
								<p className="text-lg text-fg-muted">
									{t("inboxSmsSubmitted")}
								</p>
							) : null}
							{item.sms === "capped" ? (
								<p className="text-lg text-fg-muted">{t("inboxSmsDailyCap")}</p>
							) : null}
							{item.sms === "failed" ? (
								<p className="text-lg text-destructive">
									{t("inboxSmsFailed")}
								</p>
							) : null}
							{item.email === "queued" ? (
								<p className="text-lg text-fg-muted">{t("inboxEmailQueued")}</p>
							) : null}
							{item.email === "failed" ? (
								<p className="text-lg text-destructive">
									{t("inboxEmailFailed")}
								</p>
							) : null}
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
					))}
				</ul>
			)}
			{choices.length === 0 ? null : (
				<section className="flex flex-col gap-4">
					<h2 className="font-sans text-2xl font-semibold text-fg">
						{t("inboxPrefTitle")}
					</h2>
					<ul className="flex flex-col gap-4">
						{choices.map((choice) => (
							<li key={choice.eventName} className="flex flex-col gap-2">
								<p className="text-lg text-fg">
									{t(eventLabel(choice.eventName))}
								</p>
								<div className="flex flex-wrap gap-2">
									<Button
										type="button"
										variant="quiet"
										disabled={busy}
										onClick={() =>
											void onPreference(
												choice.eventName,
												"in_app",
												!choice.inApp,
											)
										}
									>
										{t("prefInApp")} {choice.inApp ? t("prefOn") : t("prefOff")}
									</Button>
									<Button
										type="button"
										variant="quiet"
										disabled={busy}
										onClick={() =>
											void onPreference(choice.eventName, "sms", !choice.sms)
										}
									>
										{t("prefSms")} {choice.sms ? t("prefOn") : t("prefOff")}
									</Button>
									<Button
										type="button"
										variant="quiet"
										disabled={busy}
										onClick={() =>
											void onPreference(
												choice.eventName,
												"email",
												!choice.email,
											)
										}
									>
										{t("prefEmail")} {choice.email ? t("prefOn") : t("prefOff")}
									</Button>
								</div>
							</li>
						))}
					</ul>
				</section>
			)}
		</div>
	);
}
