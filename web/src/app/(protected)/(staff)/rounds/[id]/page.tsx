import { Link, useParams } from "react-router";
import { RoundMark } from "@/components/learning/round-mark";
import { Badge } from "@/components/ui/badge";
import { isApiClientError, useEngine } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";

type Criterion =
	| { kind: "points"; minimum: number }
	| { kind: "badges"; minimum?: number; badgeId?: string }
	| { kind: "hours"; minimum: number }
	| { kind: "attendance"; minimum: number }
	| { kind: "district"; districtId: string }
	| { kind: "months_active"; minimum: number };

type ResultStatus = "pass" | "fail" | "unknown";

type CriterionResult = {
	kind: Criterion["kind"];
	status: ResultStatus;
	reason: string;
};

type RoundApplication = {
	id: string;
	learnerName: string;
	statement: string;
	results: CriterionResult[];
};

type RoundDetail = {
	id: string;
	title: string;
	quantity: number;
	districtName: string;
	open: boolean;
	criteria: Criterion[];
	applications: RoundApplication[];
};

function whenLabel(open: boolean, t: (key: MessageKey) => string): string {
	return open ? t("roundsOpen") : t("roundsClosed");
}

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

export default function RoundPage() {
	const { t } = useI18n();
	const { id = "" } = useParams();
	const round = useEngine(
		"/rounds/:id",
		{ query: { id } },
		{ enabled: Boolean(id) },
	);
	const detail = round.data as RoundDetail | undefined;

	if (!id || round.isPending) {
		return <div className="h-40 animate-pulse rounded-[20px] bg-surface" />;
	}
	if (isApiClientError(round.error) && round.error.status === 403) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("roundsDenied")}
			</p>
		);
	}
	if (round.error || !detail) {
		return (
			<p className="font-sans text-2xl font-semibold text-fg">
				{t("roundsMissing")}
			</p>
		);
	}

	return (
		<section className="mx-auto flex max-w-3xl flex-col gap-8">
			<article className="rounded-[20px] bg-surface p-6 sm:p-8">
				<Link
					to="/rounds"
					className="font-meta text-xs font-semibold uppercase tracking-wide text-fg-muted underline-offset-4 hover:underline"
				>
					{t("roundsTitle")}
				</Link>
				<div className="mt-4 flex items-start gap-4">
					<RoundMark />
					<div className="min-w-0">
						<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
							{detail.title}
						</h1>
						<p className="mt-2 font-sans text-lg font-medium text-fg">
							{detail.districtName}
							{" · "}
							{t("allocationItems", { count: String(detail.quantity) })}
						</p>
						<div className="mt-3">
							<Badge variant={detail.open ? "pending" : "neutral"}>
								{whenLabel(detail.open, t)}
							</Badge>
						</div>
					</div>
				</div>
			</article>
			<section className="rounded-[20px] bg-surface p-6">
				<h2 className="font-meta text-xs font-semibold uppercase tracking-wide text-fg-muted">
					{t("inventoryRules")}
				</h2>
				{detail.criteria.length === 0 ? (
					<p className="mt-3 font-sans text-lg font-medium text-fg">
						{t("inventoryNoRules")}
					</p>
				) : (
					<ul className="mt-4 flex flex-col gap-3">
						{detail.criteria.map((rule) => (
							<li
								key={ruleSentence(rule, t)}
								className="rounded-2xl bg-canvas px-4 py-3 font-sans text-lg font-medium text-fg"
							>
								{ruleSentence(rule, t)}
							</li>
						))}
					</ul>
				)}
			</section>
			<section className="rounded-[20px] bg-surface p-6">
				<h2 className="font-meta text-xs font-semibold uppercase tracking-wide text-fg-muted">
					{t("roundsApplications")}
				</h2>
				{detail.applications.length === 0 ? (
					<p className="mt-3 font-sans text-lg font-medium text-fg">
						{t("roundsNoApplications")}
					</p>
				) : (
					<ul className="mt-4 flex flex-col gap-3">
						{detail.applications.map((application) => (
							<li
								key={application.id}
								className="rounded-2xl bg-canvas px-4 py-4"
							>
								<p className="font-sans text-lg font-semibold text-fg">
									{application.learnerName}
								</p>
								{application.statement ? (
									<p className="mt-2 font-sans text-base font-medium text-fg">
										{application.statement}
									</p>
								) : null}
								<ul className="mt-3 flex flex-wrap gap-2">
									{application.results.map((result) => (
										<li key={`${result.kind}-${result.status}`}>
											<Badge variant={resultVariant(result.status)}>
												{t(statusKey(result.status))}
											</Badge>
										</li>
									))}
								</ul>
							</li>
						))}
					</ul>
				)}
			</section>
		</section>
	);
}
