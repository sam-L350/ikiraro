import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	invalidateEngine,
	isApiClientError,
	useEngine,
	useEngineMutation,
} from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

export default function RetentionPage() {
	const { t } = useI18n();
	const policy = useEngine("/retention");
	const save = useEngineMutation("/retention/update");
	const [days, setDays] = useState("");
	const [error, setError] = useState<string | null>(null);

	if (policy.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(policy.error) && policy.error.status === 403) {
		return (
			<p className="font-sans text-lg font-medium text-fg">
				{t("retentionDenied")}
			</p>
		);
	}
	if (policy.error || !policy.data) {
		return <p className="font-sans text-lg text-fg">{t("tryAgain")}</p>;
	}

	const stored = policy.data.days;
	const ready = /^\d+$/.test(days);
	const parsed = ready ? Number(days) : null;

	return (
		<section className="flex max-w-xl flex-col gap-8">
			<div>
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{t("retentionTitle")}
				</h1>
				<p className="mt-4 font-sans text-lg font-medium text-fg">
					{t("retentionSentence")}
				</p>
			</div>
			<p className="font-sans text-lg font-medium text-fg">
				{stored === null
					? t("retentionEmpty")
					: stored === 0
						? t("retentionNone")
						: t("retentionDrops", { days: String(stored) })}
			</p>
			<label className="flex flex-col gap-2" htmlFor="retention-days">
				<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
					{t("retentionDays")}
				</span>
				<Input
					id="retention-days"
					inputMode="numeric"
					value={days}
					onChange={(event) => setDays(event.target.value)}
				/>
			</label>
			{error ? (
				<p className="font-sans text-sm font-medium text-danger" role="alert">
					{error}
				</p>
			) : null}
			{ready && parsed !== null ? (
				<div>
					<Button
						type="button"
						variant={stored === null ? "ink" : "soft"}
						disabled={save.isPending}
						onClick={() => {
							setError(null);
							void save
								.mutateAsync({ body: { days: parsed } })
								.then(async () => {
									setDays("");
									await invalidateEngine("/retention");
								})
								.catch((caught: unknown) => {
									setError(
										isApiClientError(caught) ? caught.message : t("tryAgain"),
									);
								});
						}}
					>
						{t("retentionSave")}
					</Button>
				</div>
			) : null}
		</section>
	);
}
