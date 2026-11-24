import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { isApiClientError, useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

type Mentor = { userId: number; name: string; checked: boolean };

export default function SafeguardingPage() {
	const { t } = useI18n();
	const list = useEngine("/mentor-safeguarding");
	const save = useEngineMutation("/mentor-safeguarding/create");
	const [mentorUserId, setMentorUserId] = useState("");
	const [note, setNote] = useState("");
	const ready = mentorUserId !== "" && note.trim() !== "";

	if (list.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(list.error) && list.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("messagesCheckDenied")}
			</p>
		);
	}
	if (list.error || !list.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const items = (list.data.items ?? []) as Mentor[];

	function submit(event: FormEvent) {
		event.preventDefault();
		if (!ready) return;
		save.mutate(
			{ body: { mentorUserId: Number(mentorUserId), note: note.trim() } },
			{
				onSuccess: () => {
					setMentorUserId("");
					setNote("");
					void list.refetch();
				},
			},
		);
	}

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<div>
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{t("messagesCheck")}
				</h1>
				<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
					{t("messagesCheckSentence")}
				</p>
			</div>
			<form onSubmit={submit} className="flex max-w-md flex-col gap-4">
				<label className="flex flex-col gap-2">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("messagesMentor")}
					</span>
					<select
						value={mentorUserId}
						onChange={(event) => setMentorUserId(event.target.value)}
						className="border border-ink/20 bg-paper px-3 py-2 font-sans text-lg text-fg"
					>
						<option value="">{t("messagesMentor")}</option>
						{items.map((row) => (
							<option
								key={row.userId}
								value={String(row.userId)}
								disabled={row.checked}
							>
								{row.name}
							</option>
						))}
					</select>
				</label>
				<label className="flex flex-col gap-2">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("messagesCheckNote")}
					</span>
					<textarea
						value={note}
						onChange={(event) => setNote(event.target.value)}
						className="min-h-28 border border-ink/20 bg-paper px-3 py-2 font-sans text-lg text-fg"
					/>
				</label>
				{ready ? (
					<Button type="submit" disabled={save.isPending}>
						{t("messagesCheckSend")}
					</Button>
				) : null}
			</form>
		</section>
	);
}
