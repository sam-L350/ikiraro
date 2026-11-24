import { type FormEvent, useState } from "react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isApiClientError, useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";

function statusKey(status: string): MessageKey {
	switch (status) {
		case "approved":
			return "exceptionsApprove";
		case "rejected":
			return "exceptionsDecline";
		default:
			return "exceptionsPending";
	}
}

import { useOnline } from "@/lib/offline/use-online";

type ExceptionGrant = { id: string; itemName: string; recipientName: string };
type GrantException = {
	id: string;
	itemName: string;
	reason: string;
	status: string;
	mine: boolean;
};

export default function ExceptionsPage() {
	const { t } = useI18n();
	const online = useOnline();
	const list = useEngine("/exceptions");
	const ask = useEngineMutation("/exceptions/create");
	const [grantId, setGrantId] = useState("");
	const [reason, setReason] = useState("");
	const [error, setError] = useState<MessageKey | null>(null);

	async function onAsk(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		if (!online || !chosen || !reason.trim()) {
			setError("tryAgain");
			return;
		}
		try {
			await ask.mutateAsync({
				body: { grantId: chosen, reason: reason.trim() },
			});
			setReason("");
			await list.invalidate();
		} catch {
			setError("tryAgain");
		}
	}

	if (list.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(list.error) && list.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("exceptionsDenied")}
			</p>
		);
	}
	if (list.error || !list.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const grants = (list.data.grants ?? []) as ExceptionGrant[];
	const exceptions = (list.data.exceptions ?? []) as GrantException[];
	const chosen = grantId || grants[0]?.id || "";

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<div>
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{t("exceptionsTitle")}
				</h1>
				<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
					{t("exceptionsSentence")}
				</p>
			</div>
			{grants.length === 0 ? null : (
				<form
					className="flex flex-col gap-4"
					onSubmit={(event) => void onAsk(event)}
				>
					<label className="flex flex-col gap-2" htmlFor="exception-grant">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("exceptionsGrant")}
						</span>
						<select
							id="exception-grant"
							className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
							value={chosen}
							onChange={(event) => setGrantId(event.target.value)}
						>
							{grants.map((grant) => (
								<option key={grant.id} value={grant.id}>
									{grant.itemName} · {grant.recipientName}
								</option>
							))}
						</select>
					</label>
					<label className="flex flex-col gap-2" htmlFor="exception-reason">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("exceptionsReason")}
						</span>
						<textarea
							id="exception-reason"
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
						disabled={ask.isPending}
					>
						{t("exceptionsAsk")}
					</Button>
				</form>
			)}
			{exceptions.length === 0 ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("exceptionsEmpty")}
				</p>
			) : (
				<ul>
					{exceptions.map((row) => (
						<li key={row.id} className="border-t border-ink/15 py-4">
							<Link
								to={`/exceptions/${row.id}`}
								className="flex flex-col gap-2"
							>
								<Badge variant="neutral">{t(statusKey(row.status))}</Badge>
								<p className="font-sans text-lg font-medium text-fg">
									{row.itemName}
								</p>
								<p className="font-sans text-lg font-medium text-fg">
									{row.reason}
								</p>
							</Link>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
