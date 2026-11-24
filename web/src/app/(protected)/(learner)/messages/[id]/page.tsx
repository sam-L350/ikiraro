import { type FormEvent, useState } from "react";
import { Link, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

type ThreadMessage = { id: string; body: string; mine: boolean };
type Thread = {
	otherName: string;
	blocked: boolean;
	needsCheck: boolean;
	contact: { phone: string | null; email: string } | null;
	messages: ThreadMessage[];
};

export default function MessageThreadPage() {
	const { t } = useI18n();
	const { id = "" } = useParams();
	const thread = useEngine(
		"/messages/:id",
		{ query: { id } },
		{ enabled: id !== "" },
	);
	const send = useEngineMutation("/messages/:id/send");
	const [body, setBody] = useState("");
	const data = thread.data as Thread | undefined;
	const ready = body.trim() !== "" && !data?.blocked && !data?.needsCheck;

	function submit(event: FormEvent) {
		event.preventDefault();
		if (!ready) return;
		send.mutate(
			{ body: { id, body: body.trim() } },
			{
				onSuccess: () => {
					setBody("");
					void thread.refetch();
				},
			},
		);
	}

	if (thread.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (thread.error || !data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
				{data.otherName}
			</h1>
			{data.needsCheck ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("messagesNeedCheck")}
				</p>
			) : null}
			{data.blocked ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("messagesBlocked")}
				</p>
			) : null}
			{data.contact ? (
				<p className="font-sans text-lg font-medium text-fg">
					{data.contact.email}
					{data.contact.phone ? ` · ${data.contact.phone}` : ""}
				</p>
			) : (
				<p className="font-sans text-lg font-medium text-fg">
					{t("messagesHidden")}
				</p>
			)}
			<ul>
				{data.messages.map((row) => (
					<li key={row.id} className="border-t border-ink/15 py-4">
						<p className="font-sans text-lg font-medium text-fg">{row.body}</p>
						<Link
							to={`/messages/report/${row.id}`}
							className="font-meta text-xs font-semibold uppercase tracking-wide text-fg underline"
						>
							{t("messagesReport")}
						</Link>
					</li>
				))}
			</ul>
			{!data.blocked && !data.needsCheck ? (
				<form onSubmit={submit} className="flex max-w-md flex-col gap-4">
					<label className="flex flex-col gap-2">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("messagesBody")}
						</span>
						<textarea
							value={body}
							onChange={(event) => setBody(event.target.value)}
							className="min-h-28 border border-ink/20 bg-paper px-3 py-2 font-sans text-lg text-fg"
						/>
					</label>
					{ready ? (
						<Button type="submit" disabled={send.isPending}>
							{t("messagesSend")}
						</Button>
					) : null}
				</form>
			) : null}
			<div className="flex gap-6">
				<Link
					to={`/messages/${id}/share`}
					className="font-sans text-lg font-medium text-fg underline"
				>
					{t("messagesShare")}
				</Link>
				<Link
					to={`/messages/${id}/block`}
					className="font-sans text-lg font-medium text-fg underline"
				>
					{t("messagesBlock")}
				</Link>
			</div>
		</section>
	);
}
