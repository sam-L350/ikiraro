import { type FormEvent, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isApiClientError, useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { useOnline } from "@/lib/offline/use-online";

const KINDS = ["misconduct", "bribery", "favoritism"] as const;

type Kind = (typeof KINDS)[number];

type Concern = {
	id: string;
	kind: Kind;
	centerName: string;
	body: string;
	status: "open" | "closed";
	createdAt: string;
	closedNote: string | null;
};

type Center = { id: string; name: string };

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

function reasonKey(error: unknown): MessageKey {
	if (!isApiClientError(error)) return "tryAgain";
	const reason = (error.details as { reason?: string } | undefined)?.reason;
	switch (reason) {
		case "body":
			return "reportBodyMissing";
		default:
			return "tryAgain";
	}
}

export default function ReportPage() {
	const { t } = useI18n();
	const online = useOnline();
	const centers = useEngine("/centers");
	const mine = useEngine("/misconduct");
	const send = useEngineMutation("/misconduct/create");
	const [kind, setKind] = useState<Kind>("misconduct");
	const [centerId, setCenterId] = useState("");
	const [body, setBody] = useState("");
	const [sent, setSent] = useState(false);
	const [error, setError] = useState<MessageKey | null>(null);

	if (centers.isPending || mine.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(mine.error) && mine.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("homeUnavailable")}
			</p>
		);
	}
	if (centers.error || mine.error || !centers.data || !mine.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const assigned = centers.data.assigned as Center[];
	const chosen = centerId || assigned[0]?.id || "";
	const rows = mine.data as Concern[];

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		setSent(false);
		try {
			await send.mutateAsync({
				body: { centerId: chosen, kind, body },
			});
			setBody("");
			setSent(true);
			await mine.invalidate();
		} catch (caught) {
			setError(reasonKey(caught));
		}
	}

	return (
		<div className="mx-auto flex max-w-3xl flex-col gap-8">
			<div className="flex flex-col gap-3">
				<h1 className="font-sans text-4xl font-semibold leading-tight text-fg sm:text-5xl">
					{t("reportTitle")}
				</h1>
				<p className="text-lg text-fg">{t("reportLead")}</p>
				{online ? null : (
					<p className="text-lg text-fg">{t("reportOffline")}</p>
				)}
			</div>
			{assigned.length === 0 ? (
				<p className="text-lg text-fg">{t("reportNoCenter")}</p>
			) : (
				<form
					className="flex flex-col gap-4"
					onSubmit={(event) => void onSubmit(event)}
				>
					<label className="flex flex-col gap-2" htmlFor="report-kind">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("reportKind")}
						</span>
						<select
							id="report-kind"
							className="h-11 w-full rounded-xl border border-line-strong bg-surface px-3 font-sans text-fg"
							value={kind}
							disabled={!online || send.isPending}
							onChange={(event) => {
								const next = KINDS.find((item) => item === event.target.value);
								if (next) setKind(next);
							}}
						>
							{KINDS.map((item) => (
								<option key={item} value={item}>
									{t(kindKey(item))}
								</option>
							))}
						</select>
					</label>
					{assigned.length > 1 ? (
						<label className="flex flex-col gap-2" htmlFor="report-center">
							<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
								{t("reportCenter")}
							</span>
							<select
								id="report-center"
								className="h-11 w-full rounded-xl border border-line-strong bg-surface px-3 font-sans text-fg"
								value={chosen}
								disabled={!online || send.isPending}
								onChange={(event) => setCenterId(event.target.value)}
							>
								{assigned.map((center) => (
									<option key={center.id} value={center.id}>
										{center.name}
									</option>
								))}
							</select>
						</label>
					) : null}
					<label className="flex flex-col gap-2" htmlFor="report-body">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("reportBody")}
						</span>
						<textarea
							id="report-body"
							className="min-h-32 rounded-md border border-line bg-card px-3 py-3 font-sans text-lg text-fg"
							value={body}
							disabled={!online || send.isPending}
							onChange={(event) => setBody(event.target.value)}
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
					{sent ? <p className="text-lg text-fg">{t("reportSent")}</p> : null}
					<Button
						type="submit"
						variant="sticker"
						className="w-fit"
						disabled={!online || send.isPending}
					>
						{t("reportSend")}
					</Button>
				</form>
			)}
			{rows.length === 0 ? (
				<p className="text-lg text-fg">{t("reportEmpty")}</p>
			) : (
				<ul className="flex flex-col">
					{rows.map((row) => (
						<li
							key={row.id}
							className="flex flex-col gap-2 border-t border-ink/15 py-4"
						>
							<div className="flex flex-wrap items-center gap-3">
								<p className="font-sans text-lg font-semibold text-fg">
									{t(kindKey(row.kind))}
								</p>
								<Badge variant={row.status === "open" ? "pending" : "neutral"}>
									{row.status === "open" ? t("reportOpen") : t("reportClosed")}
								</Badge>
							</div>
							<p className="font-sans text-sm text-fg">{row.centerName}</p>
							<p className="font-sans text-lg text-fg">{row.body}</p>
							{row.closedNote ? (
								<p className="font-sans text-lg text-fg">{row.closedNote}</p>
							) : null}
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
