import { Link } from "react-router";
import { BoardMark } from "@/components/public/marks";
import { EmptyState } from "@/components/ui/empty-state";
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
		<section className="mx-auto flex max-w-3xl flex-col gap-10 px-6 py-16">
			<div className="flex items-end gap-5">
				<BoardMark className="size-24 shrink-0" />
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
			</div>
			{rows.length === 0 ? (
				<EmptyState sentence={t("leaderboardEmpty")} />
			) : (
				<ol className="flex flex-col">
					{rows.map((row) => {
						const width =
							row.progress === null
								? 0
								: Math.max(0, Math.min(100, row.progress));
						return (
							<li
								key={rowKey(row)}
								className="flex flex-col gap-2 border-b border-line py-4"
							>
								<div className="flex items-baseline justify-between gap-4">
									<p className="font-sans text-2xl font-semibold text-fg">
										{row.initials}
									</p>
									<p className="font-sans text-lg font-medium text-fg">
										{row.district}
									</p>
								</div>
								{row.progress === null ? (
									<p className="font-sans text-sm font-medium text-fg">
										{t("leaderboardNoThreshold")}
									</p>
								) : (
									<>
										<div
											className="h-2 overflow-hidden rounded-full bg-surface"
											aria-hidden="true"
										>
											<div
												className="h-full bg-ink"
												style={{ width: `${width}%` }}
											/>
										</div>
										<p className="font-sans text-sm font-medium text-fg">
											{t("leaderboardProgress", {
												percent: String(row.progress),
											})}
										</p>
									</>
								)}
							</li>
						);
					})}
				</ol>
			)}
		</section>
	);
}
