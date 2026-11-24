import { useState } from "react";
import { Link } from "react-router";
import { PageTabs } from "@/components/ui/page-tabs";
import { useEngine } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

type Survey = {
	id: string;
	kind: "baseline" | "endline";
	digitalConfidence: number;
	tasksDigital: number;
	income: number;
	services: string;
	jobsOrCustomers: number;
	verified: boolean;
};

type Change = {
	digitalConfidence: number;
	tasksDigital: number;
	income: number;
	jobsOrCustomers: number;
};

type Pair = {
	baseline: Survey | null;
	endline: Survey | null;
	change: Change | null;
};

function Line({ survey }: { survey: Survey | null }) {
	const { t } = useI18n();
	if (!survey) {
		return (
			<p className="font-sans text-lg font-medium text-fg">
				{t("surveysMissing")}
			</p>
		);
	}
	return (
		<p className="font-sans text-lg font-medium text-fg">
			{survey.digitalConfidence} · {survey.tasksDigital} · {survey.income} ·{" "}
			{survey.services} · {survey.jobsOrCustomers}
			{survey.verified ? ` · ${t("surveysVerified")}` : ""}
		</p>
	);
}

export default function SurveysPage() {
	const { t } = useI18n();
	const surveys = useEngine("/surveys");
	const [tab, setTab] = useState<"baseline" | "endline">("baseline");

	if (surveys.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (surveys.error || !surveys.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const pair = surveys.data as Pair;

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<div>
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{t("surveysTitle")}
				</h1>
				<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
					{t("surveysSentence")}
				</p>
			</div>
			<PageTabs
				label={t("surveysTitle")}
				value={tab}
				onChange={setTab}
				tabs={[
					{ value: "baseline", label: t("surveysBaseline") },
					{ value: "endline", label: t("surveysEndline") },
				]}
			/>
			{tab === "baseline" ? (
				<div>
					<Link
						to="/surveys/baseline"
						className="font-sans text-lg font-medium text-fg underline"
					>
						{t("openRow")}
					</Link>
					<Line survey={pair.baseline} />
				</div>
			) : (
				<div>
					<Link
						to="/surveys/endline"
						className="font-sans text-lg font-medium text-fg underline"
					>
						{t("openRow")}
					</Link>
					<Line survey={pair.endline} />
				</div>
			)}
			{pair.change ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("surveysChange")}: {pair.change.digitalConfidence} ·{" "}
					{pair.change.tasksDigital} · {pair.change.income} ·{" "}
					{pair.change.jobsOrCustomers}
				</p>
			) : null}
		</section>
	);
}
