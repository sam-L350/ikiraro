import { type FormEvent, useState } from "react";
import { Link, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { isApiClientError, useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

type FollowUp = {
	id: string;
	day: number;
	dueOn: string;
	response: "waiting" | "answered" | "unresponsive";
	asked: boolean;
	inUse: boolean | null;
	purpose: string | null;
};

export default function FollowUpPage() {
	const { t } = useI18n();
	const { id = "" } = useParams();
	const follow = useEngine(
		"/follow-ups/:id",
		{ query: { id } },
		{ enabled: id.length > 0 },
	);
	const answer = useEngineMutation("/follow-ups/:id/answer");
	const [choice, setChoice] = useState("");
	const [purpose, setPurpose] = useState("");

	if (follow.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(follow.error) && follow.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("followUpsDenied")}
			</p>
		);
	}
	if (follow.error || !follow.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const row = follow.data as FollowUp;
	const open = row.asked && row.response === "waiting";

	function onAnswer(event: FormEvent) {
		event.preventDefault();
		if (choice !== "yes" && choice !== "no") return;
		answer.mutate(
			{
				body: {
					id,
					inUse: choice === "yes",
					purpose: choice === "yes" ? purpose : undefined,
				},
			},
			{ onSuccess: () => void follow.invalidate() },
		);
	}

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<div>
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{t("followUpsDay", { day: String(row.day) })}
				</h1>
				<p className="mt-4 font-sans text-lg font-medium text-fg">
					{row.dueOn}
				</p>
			</div>
			{row.response === "answered" ? (
				<p className="font-sans text-lg font-medium text-fg">
					{row.inUse ? row.purpose : t("followUpsNo")}
				</p>
			) : null}
			{!row.asked ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("followUpsEarly")}
				</p>
			) : null}
			{open ? (
				<form className="flex flex-col gap-4" onSubmit={onAnswer}>
					<label className="flex flex-col gap-2">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("followUpsInUse")}
						</span>
						<select
							className="rounded-md border border-ink/20 bg-paper px-3 py-3 font-sans text-lg text-fg"
							value={choice}
							onChange={(event) => setChoice(event.target.value)}
						>
							<option value="" />
							<option value="yes">{t("followUpsYes")}</option>
							<option value="no">{t("followUpsNo")}</option>
						</select>
					</label>
					{choice === "yes" ? (
						<label className="flex flex-col gap-2">
							<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
								{t("followUpsPurpose")}
							</span>
							<textarea
								className="min-h-28 rounded-md border border-ink/20 bg-paper px-3 py-3 font-sans text-lg text-fg"
								value={purpose}
								onChange={(event) => setPurpose(event.target.value)}
							/>
						</label>
					) : null}
					{choice === "yes" || choice === "no" ? (
						<Button type="submit" className="w-fit" disabled={answer.isPending}>
							{t("followUpsSave")}
						</Button>
					) : null}
				</form>
			) : null}
			{row.asked ? (
				<Link
					to={`/follow-ups/${row.id}/evidence`}
					className="font-sans text-sm font-semibold text-fg"
				>
					{t("followUpsEvidence")}
				</Link>
			) : null}
		</section>
	);
}
