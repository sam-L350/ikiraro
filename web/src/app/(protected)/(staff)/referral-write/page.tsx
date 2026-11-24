import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { isApiClientError, useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

type Learner = { id: number; name: string };

export default function WriteReferralPage() {
	const { t } = useI18n();
	const learners = useEngine("/referrals/learners");
	const save = useEngineMutation("/referrals/create");
	const [learnerId, setLearnerId] = useState("");
	const [note, setNote] = useState("");
	const ready = learnerId !== "" && note.trim() !== "";

	if (learners.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(learners.error) && learners.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("referralsDenied")}
			</p>
		);
	}
	if (learners.error || !learners.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const items = (learners.data.items ?? []) as Learner[];

	function submit(event: FormEvent) {
		event.preventDefault();
		if (!ready) return;
		save.mutate(
			{ body: { learnerId: Number(learnerId), note: note.trim() } },
			{
				onSuccess: () => {
					setLearnerId("");
					setNote("");
				},
			},
		);
	}

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<div>
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{t("referralsWrite")}
				</h1>
				<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
					{t("referralsWriteSentence")}
				</p>
			</div>
			<form onSubmit={submit} className="flex max-w-md flex-col gap-4">
				<label className="flex flex-col gap-2">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("referralsLearner")}
					</span>
					<select
						value={learnerId}
						onChange={(event) => setLearnerId(event.target.value)}
						className="border border-ink/20 bg-paper px-3 py-2 font-sans text-lg text-fg"
					>
						<option value="">{t("referralsLearner")}</option>
						{items.map((learner) => (
							<option key={learner.id} value={String(learner.id)}>
								{learner.name}
							</option>
						))}
					</select>
				</label>
				<label className="flex flex-col gap-2">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("referralsNote")}
					</span>
					<textarea
						value={note}
						onChange={(event) => setNote(event.target.value)}
						className="min-h-28 border border-ink/20 bg-paper px-3 py-2 font-sans text-lg text-fg"
					/>
				</label>
				{ready ? (
					<Button type="submit" disabled={save.isPending}>
						{t("referralsSend")}
					</Button>
				) : null}
			</form>
			{save.isSuccess ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("referralsStored")}
				</p>
			) : null}
		</section>
	);
}
