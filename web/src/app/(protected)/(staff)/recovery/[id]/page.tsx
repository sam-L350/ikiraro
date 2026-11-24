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
	serial: string;
	recipientName: string;
	status: string;
	conditions: string | null;
	agreed: boolean;
	situation: string | null;
	reason: string | null;
};

export default function RecoveryGrantPage() {
	const { t } = useI18n();
	const online = useOnline();
	const { id = "" } = useParams();
	const recovery = useEngine(
		"/recovery/:id",
		{ query: { id } },
		{ enabled: Boolean(id) },
	);
	const save = useEngineMutation("/recovery/:id/conditions");
	const [conditions, setConditions] = useState("");
	const [error, setError] = useState<MessageKey | null>(null);
	const detail = recovery.data as RecoveryDetail | undefined;

	async function onSave(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		if (!online || !detail || !conditions.trim()) {
			setError("tryAgain");
			return;
		}
		try {
			await save.mutateAsync({
				body: { id: detail.id, conditions: conditions.trim() },
			});
			setConditions("");
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
					to="/recovery"
					className="font-sans text-sm font-semibold text-fg"
				>
					{t("recoveryTitle")}
				</Link>
				<h1 className="mt-3 font-sans text-4xl font-semibold text-balance text-fg">
					{detail.itemName}
				</h1>
				<p className="mt-4 font-sans text-lg font-medium text-fg">
					{detail.serial} · {detail.recipientName}
				</p>
			</div>
			{detail.conditions ? (
				<p className="font-sans text-lg font-medium text-fg">
					{detail.conditions}
				</p>
			) : null}
			{detail.agreed ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("recoveryAgreed")}
				</p>
			) : (
				<form
					className="flex flex-col gap-4"
					onSubmit={(event) => void onSave(event)}
				>
					<label className="flex flex-col gap-2" htmlFor="recovery-conditions">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("recoveryConditions")}
						</span>
						<textarea
							id="recovery-conditions"
							className="min-h-28 rounded-md border border-line bg-card px-3 py-2 font-sans text-lg text-fg"
							value={conditions}
							maxLength={800}
							onChange={(event) => setConditions(event.target.value)}
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
						disabled={save.isPending}
					>
						{t("recoverySave")}
					</Button>
				</form>
			)}
			{detail.status === "active" ? (
				<Link
					to={`/recovery/${detail.id}/return`}
					className="font-sans text-sm font-semibold text-fg"
				>
					{t("recoveryReturn")}
				</Link>
			) : detail.reason ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("recoveryDone")} · {detail.reason}
				</p>
			) : null}
		</section>
	);
}
