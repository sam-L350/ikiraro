import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

type District = { id: string; name: string };

export default function MentorOptInPage() {
	const { t } = useI18n();
	const navigate = useNavigate();
	const own = useEngine("/mentors");
	const save = useEngineMutation("/mentors/opt-in");
	const [skill, setSkill] = useState("");
	const [districtId, setDistrictId] = useState("");
	const ready = skill.trim().length > 0 && districtId !== "";
	const districts =
		(own.data as { districts?: District[] } | undefined)?.districts ?? [];

	function submit(event: FormEvent) {
		event.preventDefault();
		if (!ready) return;
		save.mutate(
			{ body: { skill: skill.trim(), districtId } },
			{ onSuccess: () => void navigate("/mentors") },
		);
	}

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
				{t("mentorsChoose")}
			</h1>
			<form onSubmit={submit} className="flex max-w-md flex-col gap-4">
				<label className="flex flex-col gap-2">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("mentorsSkill")}
					</span>
					<input
						value={skill}
						onChange={(event) => setSkill(event.target.value)}
						className="border border-ink/20 bg-paper px-3 py-2 font-sans text-lg text-fg"
					/>
				</label>
				<label className="flex flex-col gap-2">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("mentorsDistrict")}
					</span>
					<select
						value={districtId}
						onChange={(event) => setDistrictId(event.target.value)}
						className="border border-ink/20 bg-paper px-3 py-2 font-sans text-lg text-fg"
					>
						<option value="">{t("mentorsDistrict")}</option>
						{districts.map((district) => (
							<option key={district.id} value={district.id}>
								{district.name}
							</option>
						))}
					</select>
				</label>
				{ready ? (
					<Button type="submit" disabled={save.isPending}>
						{t("mentorsOptIn")}
					</Button>
				) : null}
			</form>
		</section>
	);
}
