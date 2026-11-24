import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	invalidateEngine,
	isApiClientError,
	useEngine,
	useEngineMutation,
} from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

export default function PulsePage() {
	const { t } = useI18n();
	const pulse = useEngine("/pulse");
	const answer = useEngineMutation("/pulse/answer");
	const [body, setBody] = useState("");
	const [error, setError] = useState<string | null>(null);

	if (pulse.isPending) {
		return (
			<div className="mx-auto max-w-3xl px-4 py-8">
				<div className="h-16 animate-pulse rounded-md bg-surface" />
			</div>
		);
	}
	if (pulse.error || !pulse.data) {
		return (
			<div className="mx-auto max-w-3xl px-4 py-8">
				<p className="text-lg text-destructive">{t("tryAgain")}</p>
			</div>
		);
	}

	const moment = pulse.data.moment;
	const ready = body.trim().length > 0 && moment !== null;

	async function onSend() {
		if (!ready || !moment) return;
		setError(null);
		try {
			await answer.mutateAsync({
				body: {
					moment,
					body: body.trim(),
					...(pulse.data?.verificationId
						? { verificationId: pulse.data.verificationId }
						: {}),
				},
			});
			setBody("");
			await invalidateEngine("/pulse");
		} catch (caught) {
			setError(isApiClientError(caught) ? caught.message : t("tryAgain"));
		}
	}

	return (
		<div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
			<h1 className="font-sans text-4xl font-semibold leading-tight text-fg">
				{t("pulseTitle")}
			</h1>
			<p className="font-sans text-lg text-fg">{t("pulseSentence")}</p>
			{moment === null ? (
				<p className="font-sans text-lg text-fg">{t("pulseEmpty")}</p>
			) : (
				<div className="flex flex-col gap-4">
					<p className="font-sans text-lg text-fg">
						{moment === "first_badge" ? t("pulseFirstBadge") : t("pulseReview")}
					</p>
					<label className="flex flex-col gap-2" htmlFor="pulse-body">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("pulseBody")}
						</span>
						<textarea
							id="pulse-body"
							className="min-h-32 rounded-md border border-line bg-card px-3 py-3 font-sans text-lg text-fg"
							value={body}
							maxLength={280}
							onChange={(event) => setBody(event.target.value)}
						/>
					</label>
					{error ? (
						<p className="font-sans text-lg text-danger" role="alert">
							{error}
						</p>
					) : null}
					{ready ? (
						<Button
							type="button"
							variant="ink"
							className="w-fit"
							disabled={answer.isPending}
							onClick={() => void onSend()}
						>
							{t("pulseSave")}
						</Button>
					) : null}
				</div>
			)}
		</div>
	);
}
