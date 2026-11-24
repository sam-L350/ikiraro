import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	invalidateEngine,
	isApiClientError,
	useEngine,
	useEngineMutation,
} from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

type TemplateRow = {
	id: string;
	name: string;
	titleEn: string;
	titleRw: string | null;
	evidenceType: string | null;
};

function evidenceLabel(
	value: string | null,
	t: (
		key:
			| "contentTemplatesEvidenceNone"
			| "evidencePhoto"
			| "evidenceFile"
			| "evidenceNote"
			| "evidenceVoice",
	) => string,
): string {
	switch (value) {
		case "photo":
			return t("evidencePhoto");
		case "file":
			return t("evidenceFile");
		case "note":
			return t("evidenceNote");
		case "voice":
			return t("evidenceVoice");
		default:
			return t("contentTemplatesEvidenceNone");
	}
}

export default function TemplatesPage() {
	const { t } = useI18n();
	const navigate = useNavigate();
	const list = useEngine("/templates");
	const save = useEngineMutation("/templates/create");
	const apply = useEngineMutation("/templates/use");
	const [name, setName] = useState("");
	const [titleEn, setTitleEn] = useState("");
	const [titleRw, setTitleRw] = useState("");
	const [evidenceType, setEvidenceType] = useState("");
	const [error, setError] = useState<string | null>(null);

	if (list.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(list.error) && list.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("contentTemplatesDenied")}
			</p>
		);
	}
	if (list.error || !list.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const templates = (list.data.templates ?? []) as TemplateRow[];
	const formReady = name.trim().length > 0 && titleEn.trim().length > 0;
	const saveIsInk = templates.length === 0;
	const inkUse = templates[0]?.id ?? null;

	async function onSave() {
		if (!formReady) return;
		setError(null);
		try {
			await save.mutateAsync({
				body: {
					name: name.trim(),
					titleEn: titleEn.trim(),
					...(titleRw.trim() ? { titleRw: titleRw.trim() } : {}),
					...(evidenceType ? { evidenceType } : {}),
				},
			});
			setName("");
			setTitleEn("");
			setTitleRw("");
			setEvidenceType("");
			await invalidateEngine("/templates");
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : t("tryAgain"));
		}
	}

	async function onUse(templateId: string) {
		setError(null);
		try {
			const created = await apply.mutateAsync({ body: { templateId } });
			await navigate(`/courses/${created.courseId}`);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : t("tryAgain"));
		}
	}

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<div>
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{t("contentTemplatesTitle")}
				</h1>
				<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
					{t("contentTemplatesSentence")}
				</p>
			</div>
			{templates.length === 0 ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("contentTemplatesEmpty")}
				</p>
			) : (
				<table className="w-full border-collapse text-left">
					<thead>
						<tr className="font-meta text-xs uppercase text-fg-muted">
							<th className="border-b border-line py-2 font-semibold">
								{t("contentTemplatesName")}
							</th>
							<th className="border-b border-line py-2 font-semibold">
								{t("contentTemplatesTask")}
							</th>
							<th className="border-b border-line py-2 font-semibold">
								{t("contentTemplatesEvidence")}
							</th>
							<th className="border-b border-line py-2 font-semibold" />
						</tr>
					</thead>
					<tbody>
						{templates.map((row) => (
							<tr key={row.id}>
								<td className="border-b border-line py-3 font-sans text-lg text-fg">
									{row.name}
								</td>
								<td className="border-b border-line py-3 font-sans text-lg text-fg">
									{row.titleEn}
								</td>
								<td className="border-b border-line py-3 font-sans text-lg text-fg">
									{evidenceLabel(row.evidenceType, t)}
								</td>
								<td className="border-b border-line py-3">
									<Button
										type="button"
										variant={row.id === inkUse ? "ink" : "quiet"}
										onClick={() => void onUse(row.id)}
									>
										{t("contentTemplatesUse")}
									</Button>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
			<form
				className="flex max-w-sm flex-col gap-4"
				onSubmit={(event) => {
					event.preventDefault();
					void onSave();
				}}
			>
				<label className="flex flex-col gap-2" htmlFor="template-name">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("contentTemplatesName")}
					</span>
					<Input
						id="template-name"
						value={name}
						onChange={(event) => setName(event.target.value)}
					/>
				</label>
				<label className="flex flex-col gap-2" htmlFor="template-title-en">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("contentTemplatesTitleEn")}
					</span>
					<Input
						id="template-title-en"
						value={titleEn}
						onChange={(event) => setTitleEn(event.target.value)}
					/>
				</label>
				<label className="flex flex-col gap-2" htmlFor="template-title-rw">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("contentTemplatesTitleRw")}
					</span>
					<Input
						id="template-title-rw"
						value={titleRw}
						onChange={(event) => setTitleRw(event.target.value)}
					/>
				</label>
				<label className="flex flex-col gap-2" htmlFor="template-evidence">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("contentTemplatesEvidence")}
					</span>
					<select
						id="template-evidence"
						className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
						value={evidenceType}
						onChange={(event) => setEvidenceType(event.target.value)}
					>
						<option value="">{t("contentTemplatesEvidenceNone")}</option>
						<option value="photo">{t("evidencePhoto")}</option>
						<option value="file">{t("evidenceFile")}</option>
						<option value="note">{t("evidenceNote")}</option>
						<option value="voice">{t("evidenceVoice")}</option>
					</select>
				</label>
				{formReady ? (
					<Button
						type="submit"
						variant={saveIsInk ? "ink" : "soft"}
						disabled={save.isPending}
					>
						{t("contentTemplatesSave")}
					</Button>
				) : null}
			</form>
			{error ? <p className="text-lg text-destructive">{error}</p> : null}
		</section>
	);
}
