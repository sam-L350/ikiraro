import { type FormEvent, useEffect, useState } from "react";
import { RoundMark } from "@/components/learning/round-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
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

function resultVariant(
	status: ResultStatus,
): "verified" | "rejected" | "outline" {
	switch (status) {
		case "pass":
			return "verified";
		case "fail":
			return "rejected";
		case "unknown":
			return "outline";
		default: {
			const unreachable: never = status;
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
		return <div className="h-40 animate-pulse rounded-[20px] bg-surface" />;
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
		<section className="mx-auto flex max-w-3xl flex-col gap-8">
			{rounds.length === 0 || !selected ? (
				<EmptyState sentence={t("allocationEmpty")} />
			) : (
				<>
					{rounds.length > 1 ? (
						<ul className="grid gap-3 sm:grid-cols-2">
							{rounds.map((round) => {
								const current = round.id === selected.id;
								return (
									<li key={round.id}>
										<button
											type="button"
											aria-pressed={current}
											className={
												current
													? "flex w-full flex-col items-start gap-1 rounded-[20px] bg-ink px-4 py-4 text-left text-ink-fg"
													: "flex w-full flex-col items-start gap-1 rounded-[20px] bg-surface px-4 py-4 text-left"
											}
											onClick={() => setRoundId(round.id)}
										>
											<span className="font-sans text-lg font-semibold">
												{round.title}
											</span>
											<span className="font-meta text-xs font-semibold uppercase tracking-wide opacity-80">
												{round.districtName}
											</span>
										</button>
									</li>
								);
							})}
						</ul>
					) : null}
					<article className="rounded-[20px] bg-surface p-6 sm:p-8">
						<div className="flex items-start gap-4">
							<RoundMark />
							<div className="min-w-0">
								<p className="font-meta text-xs font-semibold uppercase tracking-wide text-fg-muted">
									{selected.districtName}
								</p>
								<h1 className="mt-1 font-sans text-4xl font-semibold text-balance text-fg">
									{selected.title}
								</h1>
								<div className="mt-3 flex flex-wrap items-center gap-2">
									<Badge variant={selected.open ? "pending" : "neutral"}>
										{selected.open ? t("roundsOpen") : t("roundsClosed")}
									</Badge>
									<span className="font-sans text-base font-medium text-fg">
										{t("allocationItems", {
											count: String(selected.quantity),
										})}
									</span>
								</div>
							</div>
						</div>
						<p className="mt-5 max-w-xl font-sans text-lg font-medium text-fg">
							{t("allocationSentence")}
						</p>
					</article>
					<section className="rounded-[20px] bg-surface p-6">
						<h2 className="font-meta text-xs font-semibold uppercase tracking-wide text-fg-muted">
							{t("inventoryRules")}
						</h2>
						{selected.criteria.length === 0 ? (
							<p className="mt-3 font-sans text-lg font-medium text-fg">
								{t("inventoryNoRules")}
							</p>
						) : (
							<ul className="mt-4 flex flex-col gap-3">
								{selected.criteria.map((rule, index) => {
									const result = selected.results[index];
									const status =
										result && isStatus(result.status)
											? result.status
											: "unknown";
									return (
										<li
											key={ruleSentence(rule, t)}
											className="flex items-center justify-between gap-4 rounded-2xl bg-canvas px-4 py-3"
										>
											<p className="font-sans text-lg font-medium text-fg">
												{ruleSentence(rule, t)}
											</p>
											<Badge variant={resultVariant(status)}>
												{t(statusKey(status))}
											</Badge>
										</li>
									);
								})}
							</ul>
						)}
					</section>
					<section className="rounded-[20px] bg-surface p-6">
						{selected.applied ? (
							<>
								<h2 className="font-sans text-2xl font-semibold text-fg">
									{t("allocationSent")}
								</h2>
								{selected.statement ? (
									<p className="mt-3 max-w-xl font-sans text-lg font-medium text-fg">
										{selected.statement}
									</p>
								) : null}
							</>
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
										className="min-h-28 rounded-2xl border border-line-strong bg-canvas px-4 py-3 font-sans text-lg text-fg"
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
								<div>
									<Button
										type="submit"
										variant="sticker"
										disabled={apply.isPending}
									>
										{t("allocationSend")}
									</Button>
								</div>
							</form>
						) : selected.open ? (
							<p className="font-sans text-lg font-medium text-fg">
								{t("allocationNotReady")}
							</p>
						) : null}
					</section>
				</>
			)}
		</section>
	);
}
