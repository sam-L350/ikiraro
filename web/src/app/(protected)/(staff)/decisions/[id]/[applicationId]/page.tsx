import { type FormEvent, useState } from "react";
import { Link, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { isApiClientError, useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { useOnline } from "@/lib/offline/use-online";

type StockItem = { id: string; name: string; serial: string };

type Applicant = {
	applicationId: string;
	learnerName: string;
	statement: string;
	rank: number | null;
};

type DecisionDetail = {
	id: string;
	title: string;
	applicants: Applicant[];
	items: StockItem[];
};

export default function DecisionAwardPage() {
	const { t } = useI18n();
	const online = useOnline();
	const { id = "", applicationId = "" } = useParams();
	const round = useEngine(
		"/decisions/:id",
		{ query: { id } },
		{ enabled: Boolean(id) },
	);
	const grant = useEngineMutation("/decisions/:id/grant");
	const decline = useEngineMutation("/decisions/:id/decline");
	const [inventoryId, setInventoryId] = useState("");
	const [reason, setReason] = useState("");
	const [error, setError] = useState<MessageKey | null>(null);
	const detail = round.data as DecisionDetail | undefined;
	const applicant = detail?.applicants.find(
		(row) => row.applicationId === applicationId,
	);
	const chosenItem = inventoryId || detail?.items[0]?.id || "";

	async function onGrant(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		if (!online || !detail || !chosenItem || !reason.trim()) {
			setError("tryAgain");
			return;
		}
		try {
			await grant.mutateAsync({
				body: {
					id: detail.id,
					applicationId,
					inventoryId: chosenItem,
					reason: reason.trim(),
					idempotencyKey: crypto.randomUUID(),
				},
			});
			setReason("");
			await round.invalidate();
		} catch {
			setError("tryAgain");
		}
	}

	async function onDecline() {
		setError(null);
		if (!online || !detail || !reason.trim()) {
			setError("tryAgain");
			return;
		}
		try {
			await decline.mutateAsync({
				body: {
					id: detail.id,
					applicationId,
					reason: reason.trim(),
				},
			});
			setReason("");
			await round.invalidate();
		} catch {
			setError("tryAgain");
		}
	}

	if (!id || !applicationId || round.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (isApiClientError(round.error) && round.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("decisionsDenied")}
			</p>
		);
	}
	if (round.error || !detail || !applicant) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("decisionsMissing")}
			</p>
		);
	}

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<div>
				<Link
					to={`/decisions/${detail.id}`}
					className="font-sans text-sm font-semibold text-fg"
				>
					{detail.title}
				</Link>
				<h1 className="mt-3 font-sans text-4xl font-semibold text-balance text-fg">
					{applicant.learnerName}
				</h1>
				<p className="mt-4 font-sans text-lg font-medium text-fg">
					{applicant.statement}
				</p>
			</div>
			{applicant.rank === null ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("decisionsRank")}
				</p>
			) : (
				<form
					className="flex flex-col gap-4"
					onSubmit={(event) => void onGrant(event)}
				>
					{detail.items.length === 0 ? (
						<p className="font-sans text-lg font-medium text-fg">
							{t("decisionsNoItem")}
						</p>
					) : (
						<label className="flex flex-col gap-2" htmlFor="decision-item">
							<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
								{t("decisionsItem")}
							</span>
							<select
								id="decision-item"
								className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
								value={chosenItem}
								onChange={(event) => setInventoryId(event.target.value)}
							>
								{detail.items.map((item) => (
									<option key={item.id} value={item.id}>
										{item.name} · {item.serial}
									</option>
								))}
							</select>
						</label>
					)}
					<label className="flex flex-col gap-2" htmlFor="decision-reason">
						<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{t("decisionsReason")}
						</span>
						<textarea
							id="decision-reason"
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
					<div className="flex flex-wrap items-center gap-3">
						{detail.items.length > 0 ? (
							<Button
								type="submit"
								variant="sticker"
								className="w-fit"
								disabled={grant.isPending}
							>
								{t("decisionsGrant")}
							</Button>
						) : null}
						<Button
							type="button"
							variant="quiet"
							disabled={decline.isPending}
							onClick={() => void onDecline()}
						>
							{t("decisionsDecline")}
						</Button>
					</div>
				</form>
			)}
		</section>
	);
}
