import { Link, useParams } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEngine } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

function textFor(locale: "rw" | "en", rw: string, en: string): string {
	if (locale === "rw" && rw.trim()) return rw;
	if (en.trim()) return en;
	return rw;
}

export default function TaskPracticePage() {
	const { enrollmentId = "", taskId = "" } = useParams();
	const { locale, t } = useI18n();
	const practice = useEngine(
		"/tasks/:id/practice",
		{ query: { id: taskId } },
		{ enabled: taskId.length > 0 },
	);

	if (practice.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (practice.error || !practice.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const sample = practice.data.sample;
	const back = `/tasks/${enrollmentId}/${taskId}`;

	return (
		<section className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-8">
			<div>
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{t("taskPracticeTitle")}
				</h1>
				<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
					{t("taskPracticeSentence")}
				</p>
			</div>
			{sample ? (
				<article className="flex flex-col gap-4">
					<Badge variant="ink" className="w-fit">
						{t("taskPracticeSample")}
					</Badge>
					<h2 className="font-sans text-2xl font-semibold text-fg">
						{textFor(locale, sample.titleRw, sample.titleEn)}
					</h2>
					<p className="font-sans text-lg text-fg">
						{textFor(locale, sample.bodyRw, sample.bodyEn)}
					</p>
				</article>
			) : (
				<p className="font-sans text-lg font-medium text-fg">
					{t("taskPracticeEmpty")}
				</p>
			)}
			<Button asChild variant="ink" className="w-fit">
				<Link to={back}>{t("taskPracticeBack")}</Link>
			</Button>
		</section>
	);
}
