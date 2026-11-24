import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { isApiClientError, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

export default function PostOpportunityPage() {
	const { t } = useI18n();
	const navigate = useNavigate();
	const save = useEngineMutation("/opportunities/create");
	const [kind, setKind] = useState("");
	const [title, setTitle] = useState("");
	const [skill, setSkill] = useState("");
	const [body, setBody] = useState("");
	const ready =
		(kind === "job" ||
			kind === "apprenticeship" ||
			kind === "contract" ||
			kind === "training") &&
		title.trim() !== "" &&
		skill.trim() !== "" &&
		body.trim() !== "";

	function submit(event: FormEvent) {
		event.preventDefault();
		if (!ready) return;
		save.mutate(
			{
				body: {
					kind,
					title: title.trim(),
					skill: skill.trim(),
					body: body.trim(),
				},
			},
			{ onSuccess: () => void navigate("/opportunities") },
		);
	}

	const denied = isApiClientError(save.error) && save.error.status === 403;

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
				{t("opportunitiesPost")}
			</h1>
			{denied ? (
				<p className="font-sans text-2xl font-semibold text-fg">
					{t("opportunitiesDenied")}
				</p>
			) : (
				<form onSubmit={submit} className="flex max-w-md flex-col gap-4">
					<label className="flex flex-col gap-2">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("opportunitiesKind")}
						</span>
						<select
							value={kind}
							onChange={(event) => setKind(event.target.value)}
							className="border border-ink/20 bg-paper px-3 py-2 font-sans text-lg text-fg"
						>
							<option value="">{t("opportunitiesKind")}</option>
							<option value="job">{t("opportunitiesJob")}</option>
							<option value="apprenticeship">
								{t("opportunitiesApprenticeship")}
							</option>
							<option value="contract">{t("opportunitiesContract")}</option>
							<option value="training">{t("opportunitiesTraining")}</option>
						</select>
					</label>
					<label className="flex flex-col gap-2">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("opportunitiesName")}
						</span>
						<input
							value={title}
							onChange={(event) => setTitle(event.target.value)}
							className="border border-ink/20 bg-paper px-3 py-2 font-sans text-lg text-fg"
						/>
					</label>
					<label className="flex flex-col gap-2">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("opportunitiesSkill")}
						</span>
						<input
							value={skill}
							onChange={(event) => setSkill(event.target.value)}
							className="border border-ink/20 bg-paper px-3 py-2 font-sans text-lg text-fg"
						/>
					</label>
					<label className="flex flex-col gap-2">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("opportunitiesBody")}
						</span>
						<textarea
							value={body}
							onChange={(event) => setBody(event.target.value)}
							className="min-h-28 border border-ink/20 bg-paper px-3 py-2 font-sans text-lg text-fg"
						/>
					</label>
					{ready ? (
						<Button type="submit" disabled={save.isPending}>
							{t("opportunitiesSend")}
						</Button>
					) : null}
				</form>
			)}
		</section>
	);
}
