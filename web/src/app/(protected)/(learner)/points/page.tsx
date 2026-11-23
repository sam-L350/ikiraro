import { isApiClientError, useEngine } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";

const POINT_KINDS = [
	"task_approved",
	"module_completed",
	"course_completed",
	"streak_bonus",
	"community_contribution",
	"manual_adjustment",
	"reversal",
] as const;

type PointKind = (typeof POINT_KINDS)[number];

type PointEntry = {
	id: string;
	createdAt: string;
	amount: number;
	uncappedAmount: number | null;
	kind: string;
};

export default function PointsPage() {
	const { locale, t } = useI18n();
	const statement = useEngine("/points/statement");

	if (statement.isPending) {
		return (
			<div className="mx-auto max-w-3xl px-4 py-8">
				<div className="h-16 animate-pulse rounded-md bg-surface" />
			</div>
		);
	}

	if (isApiClientError(statement.error) && statement.error.status === 403) {
		return (
			<div className="mx-auto max-w-3xl px-4 py-8">
				<p className="font-sans text-2xl text-fg">{t("homeUnavailable")}</p>
			</div>
		);
	}

	if (statement.error || !statement.data) {
		return (
			<div className="mx-auto max-w-3xl px-4 py-8">
				<p className="text-lg text-destructive">{t("tryAgain")}</p>
			</div>
		);
	}

	const entries = statement.data.entries as PointEntry[];

	return (
		<div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
			<h1 className="font-sans text-4xl font-semibold leading-tight text-fg sm:text-5xl">
				{t("pointsTitle")}
			</h1>
			{entries.length === 0 ? (
				<p className="text-lg text-fg">{t("pointsEmpty")}</p>
			) : (
				<>
					<p className="text-lg text-fg">
						{t("pointsBalance", { count: String(statement.data.balance) })}
					</p>
					<ul className="flex flex-col">
						{entries.map((entry) => (
							<li
								key={entry.id}
								className="flex flex-col gap-1 border-b border-line py-3"
							>
								<div className="flex min-h-11 items-center justify-between gap-3">
									<span className="text-lg text-fg">
										{reasonFor(entry.kind, t)}
									</span>
									<span className="font-meta text-lg text-fg">
										{String(entry.amount)}
									</span>
								</div>
								<p className="text-lg text-fg-muted">
									{when(entry.createdAt, locale)}
								</p>
								{entry.uncappedAmount !== null &&
								entry.uncappedAmount > entry.amount ? (
									<p className="text-lg text-fg">
										{t("pointsCapped", {
											from: String(entry.uncappedAmount),
											to: String(entry.amount),
										})}
									</p>
								) : null}
							</li>
						))}
					</ul>
				</>
			)}
		</div>
	);
}

function isKind(value: string): value is PointKind {
	switch (value) {
		case "task_approved":
		case "module_completed":
		case "course_completed":
		case "streak_bonus":
		case "community_contribution":
		case "manual_adjustment":
		case "reversal":
			return true;
		default:
			return false;
	}
}

function reasonFor(kind: string, t: (key: MessageKey) => string): string {
	if (!isKind(kind)) return t("pointsOther");
	switch (kind) {
		case "task_approved":
			return t("pointsTask");
		case "module_completed":
			return t("pointsModule");
		case "course_completed":
			return t("pointsCourse");
		case "streak_bonus":
			return t("pointsStreak");
		case "community_contribution":
			return t("pointsCommunity");
		case "manual_adjustment":
			return t("pointsAdjustment");
		case "reversal":
			return t("pointsReversal");
		default: {
			const unreachable: never = kind;
			return unreachable;
		}
	}
}

function when(value: string, locale: "en" | "rw"): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleDateString(locale === "rw" ? "rw-RW" : "en-GB", {
		day: "numeric",
		month: "short",
		year: "numeric",
		timeZone: "Africa/Kigali",
	});
}
