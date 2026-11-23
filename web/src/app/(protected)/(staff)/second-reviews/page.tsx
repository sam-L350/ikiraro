import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { isApiClientError, useEngine } from "@/lib/engine";
import { useI18n } from "@/lib/i18n";

type SecondReviewItem = {
	id: string;
	createdAt: string;
	learnerName: string;
	centerName: string;
	taskTitleRw: string;
	taskTitleEn: string;
};

function textFor(locale: "rw" | "en", rw: string, en: string): string {
	if (locale === "rw" && rw.trim()) return rw;
	if (en.trim()) return en;
	return rw;
}

export default function SecondReviewsPage() {
	const { locale, t } = useI18n();
	const queue = useEngine("/second-reviews");

	if (queue.isPending) {
		return <div className="h-8 w-48 animate-pulse rounded-full bg-surface" />;
	}
	if (queue.isError) {
		const denied = isApiClientError(queue.error) && queue.error.status === 403;
		return (
			<p className="font-sans text-lg font-medium text-fg">
				{t(denied ? "homeUnavailable" : "tryAgain")}
			</p>
		);
	}

	const items = (queue.data?.items ?? []) as SecondReviewItem[];
	const first = items[0];

	return (
		<section>
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<h1 className="font-sans text-4xl font-semibold text-balance text-fg">
						{t("secondReviewsTitle")}
					</h1>
					<p className="mt-4 max-w-xl font-sans text-lg font-medium text-fg">
						{t("secondReviewsSentence")}
					</p>
				</div>
				{first ? (
					<Button variant="sticker" asChild>
						<Link to={`/second-reviews/${first.id}`}>
							{t("secondReviewOpen")}
						</Link>
					</Button>
				) : null}
			</div>
			{items.length === 0 ? (
				<p className="mt-10 font-sans text-lg font-medium text-fg">
					{t("secondReviewsEmpty")}
				</p>
			) : (
				<ul className="mt-10">
					{items.map((item) => {
						const learner = item.learnerName.trim() || t("learnerUnnamed");
						return (
							<li key={item.id} className="border-t border-ink/15 py-5">
								<Link
									to={`/second-reviews/${item.id}`}
									className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start"
								>
									<p className="font-sans text-lg font-semibold text-fg">
										{textFor(locale, item.taskTitleRw, item.taskTitleEn)}
									</p>
									<p className="font-sans text-lg text-fg">
										{learner} · {item.centerName}
									</p>
								</Link>
							</li>
						);
					})}
				</ul>
			)}
		</section>
	);
}
