import { Link } from "react-router";
import { useEngine } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

type BoardRow = {
	initials: string;
	district: string;
	progress: number | null;
};

export default function LeaderboardPage() {
	const { t } = useI18n();
	const board = useEngine("/leaderboard");

	if (board.isPending) {
		return <div className="h-16 animate-pulse rounded-md bg-surface" />;
	}
	if (board.error || !board.data) {
		return <p className="text-lg text-destructive">{t("tryAgain")}</p>;
	}

	const rows = (board.data.rows ?? []) as BoardRow[];
	const seen = new Map<string, number>();
	function rowKey(row: BoardRow): string {
		const base = `${row.district}|${row.initials}|${row.progress ?? "none"}`;
		const next = (seen.get(base) ?? 0) + 1;
		seen.set(base, next);
		return `${base}|${next}`;
	}

	return (
		<section className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-16">
			<div>
				<Link to="/" className="font-sans text-sm font-semibold text-fg">
					{t("wordmark")}
				</Link>
				<h1 className="mt-3 font-sans text-4xl font-semibold text-balance text-fg">
					{t("leaderboardTitle")}
				</h1>
				<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
					{t("leaderboardSentence")}
				</p>
			</div>
			{rows.length === 0 ? (
				<p className="font-sans text-lg font-medium text-fg">
					{t("leaderboardEmpty")}
				</p>
			) : (
				<ul>
					{rows.map((row) => (
						<li key={rowKey(row)} className="border-t border-ink/15 py-4">
							<p className="font-sans text-lg font-medium text-fg">
								{row.initials}
							</p>
							<p className="font-meta text-xs font-semibold uppercase tracking-wide text-fg">
								{row.district}
							</p>
							<p className="font-sans text-lg font-medium text-fg">
								{row.progress === null
									? t("leaderboardNoThreshold")
									: t("leaderboardProgress", { percent: String(row.progress) })}
							</p>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
