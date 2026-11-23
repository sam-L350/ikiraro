import { useState } from "react";
import { Button } from "@/components/ui/button";
import { isApiClientError, useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import { useOnline } from "@/lib/offline/use-online";

export default function PrivacyToolsPage() {
	const { t } = useI18n();
	const online = useOnline();
	const queue = useEngine("/privacy/anonymization");
	const run = useEngineMutation("/privacy/anonymization/run");
	const [done, setDone] = useState<number | null>(null);

	async function onRun() {
		setDone(null);
		const result = await run.mutateAsync();
		setDone(result.completed);
		await queue.invalidate();
	}

	if (queue.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(queue.error) && queue.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("homeUnavailable")}
			</p>
		);
	}
	if (queue.error || !queue.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	return (
		<div className="mx-auto flex max-w-3xl flex-col gap-8">
			<div className="flex flex-col gap-3">
				<h1 className="font-sans text-4xl font-semibold leading-tight text-fg sm:text-5xl">
					{t("privacyToolsTitle")}
				</h1>
				<p className="text-lg text-fg">{t("privacyToolsLead")}</p>
				<p className="text-lg text-fg">
					{t("privacyToolsQueued", { count: String(queue.data.queued) })}
				</p>
				{online ? null : (
					<p className="text-lg text-fg">{t("offlineDecision")}</p>
				)}
			</div>
			<Button
				type="button"
				variant="sticker"
				className="w-fit"
				disabled={!online || run.isPending}
				onClick={() => void onRun()}
			>
				{t("privacyToolsRun")}
			</Button>
			{done === null ? null : (
				<p className="text-lg text-fg">
					{t("privacyToolsDone", { count: String(done) })}
				</p>
			)}
		</div>
	);
}
