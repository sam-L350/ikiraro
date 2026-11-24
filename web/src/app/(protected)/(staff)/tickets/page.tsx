import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	invalidateEngine,
	isApiClientError,
	useEngine,
	useEngineMutation,
} from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

type Ticket = {
	id: string;
	kind: string;
	body: string;
	status: "open" | "answered" | "closed";
	minutes: number | null;
};

export default function TicketsPage() {
	const { t } = useI18n();
	const list = useEngine("/tickets");
	const answer = useEngineMutation("/tickets/:id/answer");
	const close = useEngineMutation("/tickets/:id/close");
	const [notes, setNotes] = useState<Record<string, string>>({});
	const [formError, setFormError] = useState<string | null>(null);

	if (list.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (list.error || !list.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}
	if (!list.data.canAnswer) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("ticketsDenied")}
			</p>
		);
	}

	const queue = list.data.queue.filter((item) => item.status !== "closed");
	let answerShown = false;

	async function onAnswer(id: string) {
		const note = notes[id]?.trim() ?? "";
		if (!note) return;
		setFormError(null);
		try {
			await answer.mutateAsync({ body: { id, note } });
			await invalidateEngine("/tickets");
		} catch (error) {
			setFormError(isApiClientError(error) ? error.message : t("tryAgain"));
		}
	}

	async function onClose(id: string) {
		const note = notes[id]?.trim() ?? "";
		if (!note) return;
		setFormError(null);
		try {
			await close.mutateAsync({ body: { id, note } });
			await invalidateEngine("/tickets");
		} catch (error) {
			setFormError(isApiClientError(error) ? error.message : t("tryAgain"));
		}
	}

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<div>
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{t("ticketsTitle")}
				</h1>
				<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
					{t("ticketsSentence")}
				</p>
			</div>
			{queue.length === 0 ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("ticketsEmpty")}
				</p>
			) : (
				<ul className="flex flex-col gap-4">
					{queue.map((item: Ticket) => {
						const ink = !answerShown;
						answerShown = true;
						const note = notes[item.id]?.trim() ?? "";
						return (
							<li
								key={item.id}
								className="flex flex-col gap-3 rounded-md border border-line bg-card p-4"
							>
								<p className="font-sans text-lg text-fg">{item.body}</p>
								<p className="font-sans text-lg text-fg">
									{item.minutes !== null
										? t("helpAnswered", { minutes: String(item.minutes) })
										: t("helpWaiting")}
								</p>
								<label
									className="flex flex-col gap-2"
									htmlFor={`ticket-${item.id}`}
								>
									<span className="font-meta text-xs uppercase text-fg-muted">
										{t("ticketsNote")}
									</span>
									<textarea
										id={`ticket-${item.id}`}
										className="min-h-20 rounded-md border border-line bg-card px-3 py-2 font-sans text-lg text-fg"
										value={notes[item.id] ?? ""}
										onChange={(event) =>
											setNotes((current) => ({
												...current,
												[item.id]: event.target.value,
											}))
										}
									/>
								</label>
								{note !== "" ? (
									<div className="flex flex-wrap gap-3">
										{item.status === "open" ? (
											<Button
												type="button"
												variant={ink ? "ink" : "quiet"}
												className="w-fit"
												onClick={() => void onAnswer(item.id)}
											>
												{t("ticketsAnswer")}
											</Button>
										) : null}
										<Button
											type="button"
											variant="quiet"
											className="w-fit"
											onClick={() => void onClose(item.id)}
										>
											{t("ticketsClose")}
										</Button>
									</div>
								) : null}
							</li>
						);
					})}
				</ul>
			)}
			{formError ? (
				<p className="font-sans text-lg text-destructive">{formError}</p>
			) : null}
		</section>
	);
}
