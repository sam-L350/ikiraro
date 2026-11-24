import { useNavigate } from "react-router";
import { SurveyFields } from "@/components/survey-fields";
import { useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

export default function BaselinePage() {
	const { t } = useI18n();
	const navigate = useNavigate();
	const surveys = useEngine("/surveys");
	const save = useEngineMutation("/surveys/baseline");
	const stored = Boolean(
		surveys.data && "baseline" in surveys.data && surveys.data.baseline,
	);

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
				{t("surveysBaseline")}
			</h1>
			{stored ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("surveysStored")}
				</p>
			) : (
				<SurveyFields
					saveLabel={t("surveysSaveBaseline")}
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
