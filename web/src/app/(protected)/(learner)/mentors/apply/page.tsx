import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

export default function MentorApplyPage() {
	const { t } = useI18n();
	const navigate = useNavigate();
	const save = useEngineMutation("/mentors/apply");
	const [kind, setKind] = useState("");
	const [cap, setCap] = useState("");
	const capNumber = Number(cap);
	const ready =
		(kind === "mentor" || kind === "partner") &&
		cap.trim() !== "" &&
		Number.isInteger(capNumber) &&
		capNumber >= 0;

	function submit(event: FormEvent) {
		event.preventDefault();
		if (!ready) return;
		save.mutate(
			{ body: { kind, weeklyContactCap: capNumber } },
			{ onSuccess: () => void navigate("/mentors") },
		);
	}

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
				{t("mentorsApply")}
			</h1>
			<form onSubmit={submit} className="flex max-w-md flex-col gap-4">
				<label className="flex flex-col gap-2">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("mentorsKind")}
					</span>
					<select
						value={kind}
						onChange={(event) => setKind(event.target.value)}
						className="border border-ink/20 bg-paper px-3 py-2 font-sans text-lg text-fg"
					>
						<option value="">{t("mentorsKind")}</option>
						<option value="mentor">{t("mentorsKindMentor")}</option>
						<option value="partner">{t("mentorsKindPartner")}</option>
					</select>
				</label>
				<label className="flex flex-col gap-2">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("mentorsCap")}
					</span>
					<input
						inputMode="numeric"
						value={cap}
						onChange={(event) => setCap(event.target.value)}
						className="border border-ink/20 bg-paper px-3 py-2 font-sans text-lg text-fg"
					/>
				</label>
				{ready ? (
					<Button type="submit" disabled={save.isPending}>
						{t("mentorsAsk")}
					</Button>
				) : null}
			</form>
		</section>
	);
}
