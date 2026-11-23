import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isApiClientError, useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";

type Adjustment = {
	id: string;
	learnerName: string;
	learnerEmail: string;
	amount: number;
	reason: string;
	requestedByName: string;
	mine: boolean;
	status: "pending" | "approved" | "rejected";
	createdAt: string;
};

function reasonKey(error: unknown): MessageKey {
	if (!isApiClientError(error)) return "tryAgain";
	if (error.status === 404) return "adjustmentsMissing";
	const reason = (error.details as { reason?: string } | undefined)?.reason;
	switch (reason) {
		case "amount":
			return "adjustmentsAmountInvalid";
		case "reason":
			return "adjustmentsReasonRequired";
		case "email":
			return "adjustmentsMissing";
		case "self":
			return "adjustmentsSelf";
		case "closed":
			return "adjustmentsClosed";
		default:
			return "tryAgain";
	}
}

export default function AdjustmentsPage() {
	const { t } = useI18n();
	const queue = useEngine("/point-adjustments");
	const create = useEngineMutation("/point-adjustments/create");
	const approve = useEngineMutation("/point-adjustments/:id/approve");
	const reject = useEngineMutation("/point-adjustments/:id/reject");
	const [email, setEmail] = useState("");
	const [amount, setAmount] = useState("");
	const [reason, setReason] = useState("");
	const [rejectNotes, setRejectNotes] = useState<Record<string, string>>({});
	const [error, setError] = useState<MessageKey | null>(null);

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

	const rows = queue.data as Adjustment[];
	const pending = rows.filter((row) => row.status === "pending");
	const busy = create.isPending || approve.isPending || reject.isPending;

	async function onAsk(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		const parsed = Number(amount);
		if (!Number.isInteger(parsed) || parsed === 0) {
			setError("adjustmentsAmountInvalid");
			return;
		}
		try {
			await create.mutateAsync({
				body: { email, amount: parsed, reason },
			});
			setEmail("");
			setAmount("");
			setReason("");
			await queue.invalidate();
		} catch (caught) {
			setError(reasonKey(caught));
		}
	}

	async function onApprove(id: string) {
		setError(null);
		try {
			await approve.mutateAsync({ body: { id } });
			await queue.invalidate();
		} catch (caught) {
			setError(reasonKey(caught));
		}
	}

	async function onReject(id: string) {
		setError(null);
		try {
			await reject.mutateAsync({
				body: { id, reason: rejectNotes[id] ?? "" },
			});
			await queue.invalidate();
		} catch (caught) {
			setError(reasonKey(caught));
		}
	}

	return (
		<div className="mx-auto flex max-w-3xl flex-col gap-8">
			<div className="flex flex-col gap-3">
				<h1 className="font-sans text-4xl font-semibold leading-tight text-fg sm:text-5xl">
					{t("adjustmentsTitle")}
				</h1>
				<p className="text-lg text-fg">{t("adjustmentsLead")}</p>
			</div>
			<form
				className="flex flex-col gap-4"
				onSubmit={(event) => void onAsk(event)}
			>
				<label className="flex flex-col gap-2" htmlFor="adjustment-email">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("adjustmentsEmail")}
					</span>
					<Input
						id="adjustment-email"
						type="email"
						autoComplete="off"
						value={email}
						disabled={busy}
						onChange={(event) => setEmail(event.target.value)}
					/>
				</label>
				<label className="flex flex-col gap-2" htmlFor="adjustment-amount">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("adjustmentsAmount")}
					</span>
					<Input
						id="adjustment-amount"
						inputMode="numeric"
						value={amount}
						disabled={busy}
						onChange={(event) => setAmount(event.target.value)}
					/>
				</label>
				<label className="flex flex-col gap-2" htmlFor="adjustment-reason">
					<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
						{t("adjustmentsReason")}
					</span>
					<Input
						id="adjustment-reason"
						value={reason}
						disabled={busy}
						onChange={(event) => setReason(event.target.value)}
					/>
				</label>
				<Button
					type="submit"
					variant="sticker"
					disabled={busy}
					className="w-fit"
				>
					{t("adjustmentsAsk")}
				</Button>
			</form>
			{error ? <p className="text-lg text-destructive">{t(error)}</p> : null}
			<section className="flex flex-col gap-3">
				{pending.length === 0 ? (
					<p className="text-lg text-fg">{t("adjustmentsEmpty")}</p>
				) : (
					<ul className="flex flex-col">
						{pending.map((row) => (
							<li
								key={row.id}
								className="flex flex-col gap-3 border-b border-line py-4"
							>
								<p className="text-lg text-fg">
									{t("adjustmentsAsked", {
										name: row.learnerName,
										amount: String(row.amount),
									})}
								</p>
								<p className="text-lg text-fg">{row.reason}</p>
								<p className="text-lg text-fg-muted">{row.requestedByName}</p>
								{row.mine ? (
									<p className="text-lg text-fg">{t("adjustmentsSelf")}</p>
								) : (
									<div className="flex flex-col gap-3">
										<Button
											type="button"
											variant="quiet"
											className="w-fit"
											disabled={busy}
											onClick={() => void onApprove(row.id)}
										>
											{t("adjustmentsApprove")}
										</Button>
										<label
											className="flex flex-col gap-2"
											htmlFor={`reject-${row.id}`}
										>
											<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
												{t("adjustmentsRejectReason")}
											</span>
											<Input
												id={`reject-${row.id}`}
												value={rejectNotes[row.id] ?? ""}
												disabled={busy}
												onChange={(event) =>
													setRejectNotes((current) => ({
														...current,
														[row.id]: event.target.value,
													}))
												}
											/>
										</label>
										<Button
											type="button"
											variant="quiet"
											className="w-fit"
											disabled={busy}
											onClick={() => void onReject(row.id)}
										>
											{t("adjustmentsReject")}
										</Button>
									</div>
								)}
							</li>
						))}
					</ul>
				)}
			</section>
		</div>
	);
}
