import { type FormEvent, useState } from "react";
import { Link, useParams } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isApiClientError, useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { useOnline } from "@/lib/offline/use-online";

type Kind = "misconduct" | "bribery" | "favoritism";

type Concern = {
	id: string;
	kind: Kind;
	centerName: string;
	body: string;
	status: "open" | "closed";
	createdAt: string;
	closedNote: string | null;
	reporterName: string | null;
	canClose: boolean;
};

function kindKey(kind: Kind): MessageKey {
	switch (kind) {
		case "misconduct":
			return "reportMisconduct";
		case "bribery":
			return "reportBribery";
		case "favoritism":
			return "reportFavoritism";
		default: {
			const unreachable: never = kind;
			return unreachable;
		}
	}
}

export default function ConcernPage() {
	const { t } = useI18n();
	const online = useOnline();
	const { id = "" } = useParams();
	const concern = useEngine(
		"/misconduct/:id",
		{ query: { id } },
		{ enabled: Boolean(id) },
	);
	const close = useEngineMutation("/misconduct/:id/close");
	const [note, setNote] = useState("");
	const [error, setError] = useState<MessageKey | null>(null);

	async function onClose(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		try {
			await close.mutateAsync({ body: { id, note } });
			setNote("");
			await concern.invalidate();
		} catch {
			setError("tryAgain");
		}
	}

	if (concern.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(concern.error) && concern.error.status === 404) {
		return <p className="text-lg text-fg">{t("concernMissing")}</p>;
	}
	if (isApiClientError(concern.error) && concern.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("homeUnavailable")}
			</p>
		);
	}
	if (concern.error || !concern.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const row = concern.data as Concern;

	return (
		<div className="mx-auto flex max-w-3xl flex-col gap-8">
			<Link to="/concerns" className="font-sans text-sm font-semibold text-fg">
				{t("concernsTitle")}
			</Link>
			<div className="flex flex-col gap-3">
				<div className="flex flex-wrap items-center gap-3">
					<h1 className="font-sans text-4xl font-semibold leading-tight text-fg sm:text-5xl">
						{t(kindKey(row.kind))}
					</h1>
					<Badge variant={row.status === "open" ? "pending" : "neutral"}>
						{row.status === "open" ? t("reportOpen") : t("reportClosed")}
					</Badge>
				</div>
				<p className="text-lg text-fg">
					{row.centerName}
					{row.reporterName ? ` · ${row.reporterName}` : ""}
				</p>
				{online ? null : (
					<p className="text-lg text-fg">{t("reportOffline")}</p>
				)}
			</div>
			<p className="font-sans text-lg text-fg">{row.body}</p>
			{row.closedNote ? (
				<p className="font-sans text-lg text-fg">{row.closedNote}</p>
			) : null}
			{row.canClose ? (
				<form
					className="flex flex-col gap-4"
					onSubmit={(event) => void onClose(event)}
				>
					<label className="flex flex-col gap-2" htmlFor="concern-note">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("concernNote")}
						</span>
						<textarea
							id="concern-note"
							className="min-h-32 rounded-md border border-line bg-card px-3 py-3 font-sans text-lg text-fg"
							value={note}
							disabled={!online || close.isPending}
							onChange={(event) => setNote(event.target.value)}
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
						disabled={!online || close.isPending}
					>
						{t("concernClose")}
					</Button>
				</form>
			) : null}
		</div>
	);
}
