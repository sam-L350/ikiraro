import { useNavigate } from "react-router";
import { SurveyFields } from "@/components/survey-fields";
import { useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

export default function EndlinePage() {
	const { t } = useI18n();
	const navigate = useNavigate();
	const surveys = useEngine("/surveys");
	const save = useEngineMutation("/surveys/endline");

	if (surveys.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	const baseline =
		surveys.data && "baseline" in surveys.data ? surveys.data.baseline : null;
	const endline =
		surveys.data && "endline" in surveys.data ? surveys.data.endline : null;

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
				{t("surveysEndline")}
			</h1>
			{endline ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("surveysStored")}
				</p>
			) : !baseline ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("surveysNeedBaseline")}
				</p>
			) : (
				<SurveyFields
					saveLabel={t("surveysSaveEndline")}
					pending={save.isPending}
					onSave={(draft) =>
						save.mutate(
							{ body: draft },
							{ onSuccess: () => void navigate("/surveys") },
						)
					}
				/>
			)}
		</section>
	);
}
