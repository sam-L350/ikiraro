import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isApiClientError, useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";

type Place = { id: string; name: string; scope: "center" | "district" };

type Targets = {
	centers: { id: string; name: string }[];
	districts: { id: string; name: string }[];
};

function reasonKey(error: unknown): MessageKey {
	if (!isApiClientError(error)) return "tryAgain";
	if (error.status === 404) return "announcementsPlace";
	const reason = (error.details as { reason?: string } | undefined)?.reason;
	switch (reason) {
		case "title":
			return "templatesTitleField";
		case "body":
			return "announcementsBody";
		case "scope":
			return "homeUnavailable";
		default:
			return "tryAgain";
	}
}

export default function AnnouncementsPage() {
	const { t } = useI18n();
	const targets = useEngine("/announcement-targets");
	const send = useEngineMutation("/announcements/create");
	const [place, setPlace] = useState("");
	const [title, setTitle] = useState("");
	const [body, setBody] = useState("");
	const [error, setError] = useState<MessageKey | null>(null);
	const [sent, setSent] = useState(false);

	if (targets.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(targets.error) && targets.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("homeUnavailable")}
			</p>
		);
	}
	if (targets.error || !targets.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const data = targets.data as Targets;
	const places: Place[] = [
		...data.centers.map((center) => ({ ...center, scope: "center" as const })),
		...data.districts.map((district) => ({
			...district,
			scope: "district" as const,
		})),
	];

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		setSent(false);
		const selected = places.find(
			(item) => `${item.scope}:${item.id}` === place,
		);
		if (!selected) {
			setError("announcementsPlace");
			return;
		}
		try {
			await send.mutateAsync({
				body: {
					scope: selected.scope,
					scopeId: selected.id,
					title,
					body,
				},
			});
			setTitle("");
			setBody("");
			setSent(true);
		} catch (caught) {
			setError(reasonKey(caught));
		}
	}

	return (
		<div className="mx-auto flex max-w-3xl flex-col gap-8">
			<div className="flex flex-col gap-3">
				<h1 className="font-sans text-4xl font-semibold leading-tight text-fg sm:text-5xl">
					{t("announcementsTitle")}
				</h1>
				<p className="text-lg text-fg">{t("announcementsLead")}</p>
			</div>
			<form
				className="flex flex-col gap-4"
				onSubmit={(event) => void onSubmit(event)}
			>
				<label className="flex flex-col gap-2" htmlFor="announcement-place">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("announcementsPlace")}
					</span>
					<select
						id="announcement-place"
						className="h-10 w-full rounded-xl border border-line-strong bg-surface px-3.5 text-sm text-fg"
						value={place}
						disabled={send.isPending}
						onChange={(event) => setPlace(event.target.value)}
					>
						<option value="">{t("announcementsPlace")}</option>
						{places.map((item) => (
							<option
								key={`${item.scope}:${item.id}`}
								value={`${item.scope}:${item.id}`}
							>
								{item.name}
							</option>
						))}
					</select>
				</label>
				<label className="flex flex-col gap-2" htmlFor="announcement-title">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("announcementsTitleField")}
					</span>
					<Input
						id="announcement-title"
						value={title}
						disabled={send.isPending}
						onChange={(event) => setTitle(event.target.value)}
					/>
				</label>
				<label className="flex flex-col gap-2" htmlFor="announcement-body">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("announcementsBody")}
					</span>
					<Input
						id="announcement-body"
						value={body}
						disabled={send.isPending}
						onChange={(event) => setBody(event.target.value)}
					/>
				</label>
				<Button
					type="submit"
					variant="sticker"
					disabled={send.isPending}
					className="w-fit"
				>
					{t("announcementsSend")}
				</Button>
			</form>
			{error ? <p className="text-lg text-destructive">{t(error)}</p> : null}
			{sent ? <p className="text-lg text-fg">{t("inboxLead")}</p> : null}
		</div>
	);
}
