import { type FormEvent, useState } from "react";
import { Link, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { isApiClientError, useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { useOnline } from "@/lib/offline/use-online";

type RecoveryDetail = {
	id: string;
	itemName: string;
	status: string;
	reason: string | null;
};

export default function RecoveryReturnPage() {
	const { t } = useI18n();
	const online = useOnline();
	const { id = "" } = useParams();
	const recovery = useEngine(
		"/recovery/:id",
		{ query: { id } },
		{ enabled: Boolean(id) },
	);
	const send = useEngineMutation("/recovery/:id/return");
	const [situation, setSituation] = useState("");
	const [reason, setReason] = useState("");
	const [error, setError] = useState<MessageKey | null>(null);
	const detail = recovery.data as RecoveryDetail | undefined;

	async function onReturn(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		if (
			!online ||
			!detail ||
			(situation !== "unused" &&
				situation !== "lost" &&
				situation !== "misused") ||
			!reason.trim()
		) {
			setError("tryAgain");
			return;
		}
		try {
			await send.mutateAsync({
				body: { id: detail.id, situation, reason: reason.trim() },
			});
			setReason("");
			await recovery.invalidate();
		} catch {
			setError("tryAgain");
		}
	}

	if (!id || recovery.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(recovery.error) && recovery.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("recoveryDenied")}
			</p>
		);
	}
	if (recovery.error || !detail) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("recoveryMissing")}
			</p>
		);
	}

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<div>
				<Link
					to={`/recovery/${detail.id}`}
					className="font-sans text-sm font-semibold text-fg"
				>
					{detail.itemName}
				</Link>
				<h1 className="mt-3 font-sans text-4xl font-semibold text-balance text-fg">
					{t("recoveryReturn")}
				</h1>
			</div>
			{detail.status !== "active" ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("recoveryDone")}
					{detail.reason ? ` · ${detail.reason}` : ""}
				</p>
			) : (
				<form
					className="flex flex-col gap-4"
					onSubmit={(event) => void onReturn(event)}
				>
					<label className="flex flex-col gap-2" htmlFor="recovery-situation">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("recoverySituation")}
						</span>
						<select
							id="recovery-situation"
							className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
							value={situation}
							onChange={(event) => setSituation(event.target.value)}
						>
							<option value="">{t("recoverySituation")}</option>
							<option value="unused">{t("recoveryUnused")}</option>
							<option value="lost">{t("recoveryLost")}</option>
							<option value="misused">{t("recoveryMisused")}</option>
						</select>
					</label>
					<label className="flex flex-col gap-2" htmlFor="recovery-reason">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("recoveryReason")}
						</span>
						<textarea
							id="recovery-reason"
							className="min-h-28 rounded-md border border-line bg-card px-3 py-2 font-sans text-lg text-fg"
							value={reason}
							maxLength={400}
							onChange={(event) => setReason(event.target.value)}
						/>
					</label>
					{error ? (
						<p
							className="font-sans text-sm font-medium text-danger"
							role="alert"
						>
							{t(error)}
						</p>
					) : null}
					<Button
						type="submit"
						variant="sticker"
						className="w-fit"
						disabled={send.isPending}
					>
						{t("recoveryReturn")}
					</Button>
				</form>
			)}
		</section>
	);
}
