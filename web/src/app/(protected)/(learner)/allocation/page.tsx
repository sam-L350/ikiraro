import { type FormEvent, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isApiClientError, useEngine, useEngineMutation } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { useOnline } from "@/lib/offline/use-online";

type Criterion =
	| { kind: "points"; minimum: number }
	| { kind: "badges"; minimum?: number; badgeId?: string }
	| { kind: "hours"; minimum: number }
	| { kind: "attendance"; minimum: number }
	| { kind: "district"; districtId: string }
	| { kind: "months_active"; minimum: number };

type ResultStatus = "pass" | "fail" | "unknown";

type LearnerRound = {
	id: string;
	title: string;
	quantity: number;
	districtName: string;
	open: boolean;
	criteria: Criterion[];
	results: { kind: Criterion["kind"]; status: ResultStatus }[];
	applied: boolean;
	statement: string | null;
};

function ruleSentence(
	rule: Criterion,
	t: (key: MessageKey, vars?: Record<string, string>) => string,
): string {
	switch (rule.kind) {
		case "points":
			return t("inventoryPointsRule", { count: String(rule.minimum) });
		case "badges":
			if (rule.minimum !== undefined) {
				return t("inventoryBadgesRule", { count: String(rule.minimum) });
			}
			return t("inventoryBadgeOne");
		case "hours":
			return t("inventoryHoursRule", { count: String(rule.minimum) });
		case "attendance":
			return t("inventoryAttendanceRule", { count: String(rule.minimum) });
		case "months_active":
			return t("inventoryMonthsRule", { count: String(rule.minimum) });
		case "district":
			return t("inventoryDistrictRule");
		default: {
			const unreachable: never = rule;
			return unreachable;
		}
	}
}

function statusKey(status: ResultStatus): MessageKey {
	switch (status) {
		case "pass":
			return "allocationPass";
		case "fail":
			return "allocationFail";
		case "unknown":
			return "allocationUnknown";
		default: {
			const unreachable: never = status;
			return unreachable;
		}
	}
}

function isStatus(value: string): value is ResultStatus {
	switch (value) {
		case "pass":
		case "fail":
		case "unknown":
			return true;
		default:
			return false;
	}
}

export default function AllocationPage() {
	const { t } = useI18n();
	const online = useOnline();
	const list = useEngine("/allocation");
	const apply = useEngineMutation("/allocation/apply");
	const [roundId, setRoundId] = useState("");
	const [statement, setStatement] = useState("");
	const [error, setError] = useState<MessageKey | null>(null);
	const rounds = (list.data?.rounds ?? []) as LearnerRound[];

	useEffect(() => {
		const first = rounds[0];
		if (!roundId && first) setRoundId(first.id);
	}, [roundId, rounds]);

	const selected = rounds.find((round) => round.id === roundId) ?? rounds[0];
	const ready =
		selected?.results.every((result) => result.status === "pass") ?? false;

	async function onSend(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		if (!online || !selected || !statement.trim()) {
			setError("tryAgain");
			return;
		}
		try {
			await apply.mutateAsync({
				body: { roundId: selected.id, statement: statement.trim() },
			});
			setStatement("");
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
				{t("allocationDenied")}
			</p>
		);
	}
	if (list.error || !list.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	return (
		<section className="flex max-w-3xl flex-col gap-8">
			<div>
				<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
					{t("allocationTitle")}
				</h1>
				<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
					{t("allocationSentence")}
				</p>
			</div>
			{rounds.length === 0 || !selected ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("allocationEmpty")}
				</p>
			) : (
				<div className="flex flex-col gap-6">
					{rounds.length > 1 ? (
						<label className="flex flex-col gap-2" htmlFor="allocation-round">
							<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
								{t("roundsName")}
							</span>
							<select
								id="allocation-round"
								className="h-11 rounded-md border border-line bg-card px-3 font-sans text-lg text-fg"
								value={selected.id}
								onChange={(event) => setRoundId(event.target.value)}
							>
								{rounds.map((round) => (
									<option key={round.id} value={round.id}>
										{round.title}
									</option>
								))}
							</select>
						</label>
					) : null}
					<div className="flex flex-col gap-2">
						<div className="flex flex-wrap items-center gap-3">
							<Badge variant={selected.open ? "pending" : "neutral"}>
								{selected.open ? t("roundsOpen") : t("roundsClosed")}
							</Badge>
							<p className="font-sans text-lg font-medium text-fg">
								{selected.title}
							</p>
						</div>
						<p className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
							{selected.districtName} ·{" "}
							{t("allocationItems", { count: String(selected.quantity) })}
						</p>
					</div>
					{selected.criteria.length === 0 ? (
						<p className="font-sans text-lg font-medium text-fg">
							{t("inventoryNoRules")}
						</p>
					) : (
						<ul className="flex flex-col gap-2">
							{selected.criteria.map((rule, index) => {
								const result = selected.results[index];
								const status =
									result && isStatus(result.status) ? result.status : "unknown";
								return (
									<li
										key={ruleSentence(rule, t)}
										className="flex flex-col gap-1"
									>
										<p className="font-sans text-lg font-medium text-fg">
											{ruleSentence(rule, t)}
										</p>
										<Badge variant={status === "fail" ? "danger" : "neutral"}>
											{t(statusKey(status))}
										</Badge>
									</li>
								);
							})}
						</ul>
					)}
					{selected.applied ? (
						<div className="flex flex-col gap-2">
							<p className="font-sans text-lg font-medium text-fg">
								{t("allocationSent")}
							</p>
							{selected.statement ? (
								<p className="font-sans text-lg font-medium text-fg">
									{selected.statement}
								</p>
							) : null}
						</div>
					) : ready && selected.open ? (
						<form
							className="flex flex-col gap-4"
							onSubmit={(event) => void onSend(event)}
						>
							<label
								className="flex flex-col gap-2"
								htmlFor="allocation-statement"
							>
								<span className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
									{t("allocationStatement")}
								</span>
								<textarea
									id="allocation-statement"
									className="min-h-28 rounded-md border border-line bg-card px-3 py-2 font-sans text-lg text-fg"
									value={statement}
									maxLength={400}
									onChange={(event) => setStatement(event.target.value)}
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
								disabled={apply.isPending}
							>
								{t("allocationSend")}
							</Button>
						</form>
					) : null}
				</div>
			)}
		</section>
	);
}
