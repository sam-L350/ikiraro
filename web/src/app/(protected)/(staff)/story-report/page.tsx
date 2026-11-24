import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { callEngine, isApiClientError, useEngine } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

export default function StoryReportPage() {
	const { t } = useI18n();
	const report = useEngine("/success-stories/report");

	async function onDownload() {
		const result = await callEngine("/success-stories/export");
		const blob = new Blob([result.file], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = "ikiraro-stories.json";
		link.click();
		URL.revokeObjectURL(url);
	}

	if (report.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(report.error) && report.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("storyReportDenied")}
			</p>
		);
	}
	if (report.error || !report.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const stories = report.data.stories;

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<div>
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{t("storyReportTitle")}
				</h1>
				<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
					{t("storyReportSentence")}
				</p>
			</div>
			{stories.length === 0 ? (
				<EmptyState sentence={t("storyReportEmpty")} />
			) : (
				<ul className="flex flex-col gap-6">
					{stories.map((item) => (
						<li
							key={`${item.name}-${item.story}`}
							className="flex flex-col gap-3"
						>
							<h2 className="font-sans text-2xl font-semibold text-fg">
								{item.name}
							</h2>
							<p className="font-sans text-lg text-fg">{item.story}</p>
							<img
								src={item.photoUrl}
								alt=""
								className="max-h-64 w-auto rounded-md border border-line"
							/>
						</li>
					))}
				</ul>
			)}
			{stories.length > 0 ? (
				<Button
					type="button"
					variant="quiet"
					className="w-fit"
					onClick={() => void onDownload()}
				>
					{t("storyReportDownload")}
				</Button>
			) : null}
		</section>
	);
}
